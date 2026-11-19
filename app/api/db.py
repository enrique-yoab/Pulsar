"""
PULSAR TECHNOLOGIES - Acceso a Base de Datos SQLite (app/api/db.py)
Conectado al esquema principal (BD/schema.sql):
  usuarios -> prospecto -> servicio -> cotizacion -> detalleCotizacion -> producto -> categoria
"""

from datetime import datetime, timezone
import os
from pathlib import Path
import random
import secrets
import sqlite3

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BD_DIR = Path(os.environ.get("PULSAR_BD_DIR") or (PROJECT_ROOT / "BD"))
DB_PATH = Path(os.environ.get("PULSAR_DB_PATH") or (BD_DIR / "pulsar.db"))
SCHEMA_PATH = BD_DIR / "schema.sql"
SEED_PATH = BD_DIR / "seed.sql"

ROUTER_CAPACITY = {
    "basico": 4,
    "regular": 7,
    "tecnico": 8,
    "profesional": 16,
}

FIREWALL_CAPACITY = {
    "basico": 4,
    "regular": 4,
    "tecnico": 6,
    "profesional": 8,
}


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    """Abre una conexión SQLite devolviendo filas como diccionarios (sqlite3.Row)."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(db_path: Path = DB_PATH) -> None:
    """Crea las tablas desde schema.sql y carga el catálogo inicial desde seed.sql."""
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"No se encontró el archivo de esquema: {SCHEMA_PATH}")
    with get_connection(db_path) as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        if SEED_PATH.exists():
            conn.executescript(SEED_PATH.read_text(encoding="utf-8"))
        conn.commit()


def listar_dispositivos(
    categoria: str | None = None,
    nivel: str | None = None,
    db_path: Path = DB_PATH,
) -> list[dict]:
    """Consulta PRODUCTO unido con CATEGORIA para entregar el catálogo al Front-End."""
    sql = """
        SELECT
            p.idProducto AS id_producto,
            p.idCategoria AS id_categoria,
            p.idCategoria AS categoria,
            c.nombre AS categoria_nombre,
            p.nombre,
            p.modelo,
            p.marca,
            p.especificacionesTecnicas AS especificaciones_tecnicas,
            p.precio,
            p.nivel,
            p.subtipo,
            p.puertos,
            p.puertosPoe AS puertos_poe
        FROM producto p
        INNER JOIN categoria c ON c.idCategoria = p.idCategoria
        WHERE p.activo = 1
    """
    params: list = []

    if categoria:
        sql += " AND p.idCategoria = ?"
        params.append(categoria.strip())
    if nivel:
        sql += " AND p.nivel = ?"
        params.append(nivel.strip())

    sql += " ORDER BY c.idCategoria ASC, p.precio ASC"

    with get_connection(db_path) as conn:
        try:
            rows = conn.execute(sql, params).fetchall()
        except sqlite3.OperationalError as exc:
            if "no such table" in str(exc).lower():
                init_db(db_path)
                rows = conn.execute(sql, params).fetchall()
            else:
                raise
        return [dict(row) for row in rows]


def evaluar_necesidad_switch(paso2: dict | None) -> dict:
    """
    Deduce en el servidor si los dispositivos elegidos en Paso 2
    exceden la capacidad de puertos Ethernet del Router (o Firewall activo).
    """
    if not isinstance(paso2, dict) or not paso2.get("needsNetwork"):
        return {
            "switch_requerido": False,
            "puertos_ocupados": 0,
            "puertos_disponibles": 0,
            "puertos_minimos_switch": 0,
            "puertos_poe_requeridos": 0,
        }

    router_tier = (paso2.get("router") or {}).get("tier", "tecnico")
    fw_cfg = paso2.get("firewall") or {}
    fw_enabled = bool(fw_cfg.get("enabled"))
    fw_tier = fw_cfg.get("tier", "tecnico")

    cam_cfg = paso2.get("camaras") or {}
    cam_total = int(cam_cfg.get("total") or 0) if cam_cfg.get("enabled") else 0
    server_ports = 1 if cam_cfg.get("enabled") else 0

    ap_cfg = paso2.get("accessPoints") or {}
    ap_count = int(ap_cfg.get("count") or 0) if ap_cfg.get("enabled") else 0

    puertos_ocupados = cam_total + server_ports + ap_count
    puertos_poe = cam_total + ap_count
    puertos_disponibles = (
        FIREWALL_CAPACITY.get(fw_tier, 4)
        if fw_enabled
        else ROUTER_CAPACITY.get(router_tier, 8)
    )
    switch_requerido = puertos_ocupados > puertos_disponibles

    return {
        "switch_requerido": switch_requerido,
        "puertos_ocupados": puertos_ocupados,
        "puertos_disponibles": puertos_disponibles,
        "puertos_minimos_switch": (puertos_ocupados + 1) if switch_requerido else 0,
        "puertos_poe_requeridos": puertos_poe,
    }


def calcular_cotizacion(
    items: list[dict],
    paso2: dict | None = None,
    db_path: Path = DB_PATH,
) -> dict:
    """
    Recibe { id_producto, cantidad }, consulta los precios unitarios REALES en PRODUCTO
    y devuelve el desglose oficial y monto total estimado.
    """
    if not isinstance(items, list) or len(items) == 0:
        raise ValueError("Debes incluir al menos un producto o servicio para calcular.")

    cantidades_por_id: dict[str, int] = {}
    for entry in items:
        if not isinstance(entry, dict):
            raise ValueError("Formato inválido en la lista de productos.")
        prod_id = str(entry.get("id_producto") or entry.get("idProducto") or "").strip()
        try:
            cantidad = int(entry.get("cantidad", 1))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Cantidad inválida para el producto '{prod_id}'.") from exc

        if not prod_id:
            raise ValueError("Falta idProducto en uno de los elementos.")
        if cantidad < 1 or cantidad > 500:
            raise ValueError(f"Cantidad fuera de rango (1-500) para '{prod_id}'.")

        cantidades_por_id[prod_id] = cantidades_por_id.get(prod_id, 0) + cantidad

    placeholders = ",".join("?" for _ in cantidades_por_id)
    sql = f"""
        SELECT
            p.idProducto AS id_producto,
            p.nombre,
            p.modelo,
            p.marca,
            p.precio,
            p.idCategoria AS categoria,
            c.nombre AS categoria_nombre
        FROM producto p
        INNER JOIN categoria c ON c.idCategoria = p.idCategoria
        WHERE p.activo = 1 AND p.idProducto IN ({placeholders})
    """

    with get_connection(db_path) as conn:
        rows = conn.execute(sql, list(cantidades_por_id.keys())).fetchall()

    productos_db = {row["id_producto"]: dict(row) for row in rows}
    faltantes = [pid for pid in cantidades_por_id if pid not in productos_db]
    if faltantes:
        raise LookupError(f"Productos no encontrados en la base de datos: {', '.join(faltantes)}")

    detalle: list[dict] = []
    monto_total = 0.0

    for pid, cantidad in cantidades_por_id.items():
        prod = productos_db[pid]
        precio_unitario = round(float(prod["precio"]), 2)
        subtotal = round(precio_unitario * cantidad, 2)
        monto_total = round(monto_total + subtotal, 2)
        detalle.append(
            {
                "id_producto": pid,
                "categoria": prod["categoria"],
                "categoria_nombre": prod["categoria_nombre"],
                "nombre": prod["nombre"],
                "modelo": prod["modelo"],
                "marca": prod["marca"],
                "cantidad": cantidad,
                "precio_unitario": precio_unitario,
                "subtotal": subtotal,
            }
        )

    evaluacion_red = evaluar_necesidad_switch(paso2)

    return {
        "moneda": "MXN",
        "detalle": detalle,
        "monto_total_estimado": monto_total,
        "evaluacion_red": evaluacion_red,
    }


def _obtener_o_crear_prospecto(
    conn: sqlite3.Connection,
    nombre: str,
    empresa: str,
    correo: str,
    direccion: str,
    telefono: str,
) -> tuple[str, str, str]:
    """
    Crea el registro en USUARIOS + PROSPECTO (o actualiza si ese correo ya existe).
    Devuelve (idProspecto, idUsuario, llaveSesion).
    """
    correo_norm = correo.strip().lower()
    existente = conn.execute(
        """
        SELECT p.idProspecto, p.idUsuario, u.llaveSesion
        FROM prospecto p
        INNER JOIN usuarios u ON u.idUsuario = p.idUsuario
        WHERE LOWER(p.correo) = ?
        """,
        (correo_norm,),
    ).fetchone()

    if existente:
        id_prospecto = existente["idProspecto"]
        id_usuario = existente["idUsuario"]
        llave_sesion = existente["llaveSesion"]
        conn.execute(
            """
            UPDATE prospecto
            SET nombreCliente = ?, nombreEmpresa = ?, direccion = ?, telefono = ?
            WHERE idProspecto = ?
            """,
            (nombre, empresa, direccion, telefono, id_prospecto),
        )
        return id_prospecto, id_usuario, llave_sesion

    id_usuario = f"USR-{secrets.token_hex(4).upper()}"
    while conn.execute("SELECT 1 FROM usuarios WHERE idUsuario = ?", (id_usuario,)).fetchone():
        id_usuario = f"USR-{secrets.token_hex(4).upper()}"

    id_prospecto = f"PRO-{secrets.token_hex(4).upper()}"
    while conn.execute("SELECT 1 FROM prospecto WHERE idProspecto = ?", (id_prospecto,)).fetchone():
        id_prospecto = f"PRO-{secrets.token_hex(4).upper()}"

    llave_sesion = secrets.token_urlsafe(24)

    conn.execute(
        "INSERT INTO usuarios (idUsuario, llaveSesion) VALUES (?, ?)",
        (id_usuario, llave_sesion),
    )
    conn.execute(
        """
        INSERT INTO prospecto (
            idProspecto, idUsuario, nombreEmpresa, nombreCliente, correo, direccion, telefono
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (id_prospecto, id_usuario, empresa, nombre, correo_norm, direccion, telefono),
    )
    return id_prospecto, id_usuario, llave_sesion


def _resumir_descripcion_servicio(paso1: dict) -> str:
    partes = []
    if paso1.get("red"):
        partes.append("Protección de Red / Internet")
    if paso1.get("camaras"):
        partes.append("Videovigilancia CCTV")
    if paso1.get("web"):
        partes.append("Desarrollo Web / Hosting")
    return " + ".join(partes) if partes else "Cotización de infraestructura Pulsar"


def crear_cotizacion(payload: dict, db_path: Path = DB_PATH) -> dict:
    """
    Registra USUARIOS + PROSPECTO + SERVICIO + COTIZACION + DETALLE_COTIZACION
    al cierre del Paso 4, recalculando precios reales desde PRODUCTO.
    """
    if not isinstance(payload, dict):
        raise ValueError("Cuerpo JSON inválido.")

    cliente = payload.get("cliente") or {}
    nombre = str(cliente.get("nombre") or "").strip()
    empresa = str(cliente.get("empresa") or "").strip()
    correo = str(cliente.get("correo") or "").strip()
    direccion = str(cliente.get("direccion") or cliente.get("ciudad") or "").strip()
    telefono = str(cliente.get("telefono") or "").strip()
    comentarios = str(cliente.get("comentarios") or "").strip()

    if not nombre or not correo or not telefono:
        raise ValueError("Nombre, correo electrónico y teléfono son obligatorios.")
    if "@" not in correo or "." not in correo.split("@")[-1]:
        raise ValueError("El correo electrónico no tiene un formato válido.")

    paso1 = payload.get("paso1") or {}
    paso2 = payload.get("paso2") or {}
    items = payload.get("items") or []

    calculo = calcular_cotizacion(items=items, paso2=paso2, db_path=db_path)

    ahora = datetime.now(timezone.utc)
    fecha_iso = ahora.isoformat()
    folio = f"PUL-{ahora.strftime('%y%m%d')}-{random.randint(1000, 9999)}"
    descripcion_servicio = _resumir_descripcion_servicio(paso1)

    with get_connection(db_path) as conn:
        id_prospecto, id_usuario, llave_sesion = _obtener_o_crear_prospecto(
            conn=conn,
            nombre=nombre,
            empresa=empresa,
            correo=correo,
            direccion=direccion,
            telefono=telefono,
        )

        id_servicio = f"SRV-{secrets.token_hex(4).upper()}"
        while conn.execute("SELECT 1 FROM servicio WHERE idServicio = ?", (id_servicio,)).fetchone():
            id_servicio = f"SRV-{secrets.token_hex(4).upper()}"

        conn.execute(
            """
            INSERT INTO servicio (idServicio, idProspecto, descripcion, estado)
            VALUES (?, ?, ?, ?)
            """,
            (id_servicio, id_prospecto, descripcion_servicio, "por_confirmar"),
        )

        while conn.execute("SELECT 1 FROM cotizacion WHERE idCotizacion = ?", (folio,)).fetchone():
            folio = f"PUL-{ahora.strftime('%y%m%d')}-{random.randint(1000, 9999)}"
        id_cotizacion = folio

        conn.execute(
            """
            INSERT INTO cotizacion (
                idCotizacion, idProspecto, idServicio, fechaEmision,
                montoTotal, comentarios, estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                id_cotizacion,
                id_prospecto,
                id_servicio,
                fecha_iso,
                calculo["monto_total_estimado"],
                comentarios,
                "en_evaluacion",
            ),
        )

        for idx, item in enumerate(calculo["detalle"], start=1):
            id_detalle = f"{id_cotizacion}-D{idx:02d}"
            conn.execute(
                """
                INSERT INTO detalleCotizacion (
                    idDetalle, idCotizacion, idProducto, cantidad, precioUnitario
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    id_detalle,
                    id_cotizacion,
                    item["id_producto"],
                    item["cantidad"],
                    item["precio_unitario"],
                ),
            )

        conn.commit()

    return {
        "id_cotizacion": id_cotizacion,
        "folio": folio,
        "id_usuario": id_usuario,
        "id_prospecto": id_prospecto,
        "id_servicio": id_servicio,
        "llave_sesion": llave_sesion,
        "fecha_emision": fecha_iso,
        "estado": "en_evaluacion",
        "moneda": calculo["moneda"],
        "monto_total_estimado": calculo["monto_total_estimado"],
        "detalle": calculo["detalle"],
        "evaluacion_red": calculo["evaluacion_red"],
    }


def obtener_cotizaciones(folio: str | None = None, db_path: Path = DB_PATH) -> list[dict]:
    """Consulta cotizaciones junto con PROSPECTO, SERVICIO y DETALLE_COTIZACION."""
    base_sql = """
        SELECT
            c.idCotizacion AS id_cotizacion,
            c.idCotizacion AS folio,
            c.idProspecto AS id_prospecto,
            c.idServicio AS id_servicio,
            c.fechaEmision AS fecha_emision,
            c.montoTotal AS monto_total_estimado,
            c.comentarios,
            c.estado,
            u.idUsuario AS id_usuario,
            u.llaveSesion AS llave_sesion,
            pr.nombreCliente AS nombre_cliente,
            pr.nombreEmpresa AS nombre_empresa,
            pr.correo,
            pr.direccion,
            pr.telefono,
            s.descripcion AS descripcion_servicio
        FROM cotizacion c
        INNER JOIN prospecto pr ON pr.idProspecto = c.idProspecto
        INNER JOIN usuarios u ON u.idUsuario = pr.idUsuario
        INNER JOIN servicio s ON s.idServicio = c.idServicio
    """
    with get_connection(db_path) as conn:
        if folio:
            rows = conn.execute(
                base_sql + " WHERE c.idCotizacion = ?", (folio.strip(),)
            ).fetchall()
        else:
            rows = conn.execute(
                base_sql + " ORDER BY c.fechaEmision DESC LIMIT 20"
            ).fetchall()

        resultados = []
        for row in rows:
            cot = dict(row)
            detalles = conn.execute(
                """
                SELECT
                    d.idDetalle AS id_detalle,
                    d.idProducto AS id_producto,
                    p.nombre,
                    p.modelo,
                    d.cantidad,
                    d.precioUnitario AS precio_unitario,
                    ROUND(d.cantidad * d.precioUnitario, 2) AS subtotal
                FROM detalleCotizacion d
                INNER JOIN producto p ON p.idProducto = d.idProducto
                WHERE d.idCotizacion = ?
                """,
                (cot["id_cotizacion"],),
            ).fetchall()
            cot["detalle"] = [dict(d) for d in detalles]
            resultados.append(cot)
        return resultados
