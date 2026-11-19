"""
PULSAR TECHNOLOGIES - Servidor API HTTP en Python (app/api/server.py)
Expone endpoints REST en JSON conectados a SQLite sin dependencias externas:
  - GET  /api/health                -> Estado del servidor y BD
  - GET  /api/dispositivos          -> Catálogo de PRODUCTO + CATEGORIA
  - GET  /api/cotizaciones          -> Consulta cotizaciones guardadas
  - POST /api/cotizaciones/calcular -> Calcula precios unitarios reales y total
  - POST /api/cotizaciones          -> Guarda COTIZACION + DETALLE_COTIZACION
  - POST /api/formulario            -> Envia los datos de la cotizacion y su informacion privada.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from urllib.parse import parse_qs, urlparse

from db import (
    DB_PATH,
    calcular_cotizacion,
    crear_cotizacion,
    init_db,
    listar_dispositivos,
    obtener_cotizaciones,
)


class PulsarAPIHandler(BaseHTTPRequestHandler):
    """Manejador de peticiones HTTP GET / POST / OPTIONS con respuesta en JSON."""

    protocol_version = "HTTP/1.1"

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status_code: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            raise ValueError("El cuerpo de la petición está vacío.")
        if content_length > 1_048_576:
            raise ValueError("El cuerpo de la petición excede el límite permitido (1 MB).")

        raw = self.rfile.read(content_length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("JSON mal formado en la petición.") from exc

    def do_OPTIONS(self) -> None:
        """Responde preflight CORS para peticiones desde otro puerto local."""
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)

        if path == "/api/health":
            self._send_json(
                200,
                {
                    "ok": True,
                    "estado": "en_linea",
                    "base_datos": "sqlite",
                    "archivo_bd": DB_PATH.name,
                },
            )
            return

        if path == "/api/dispositivos":
            categoria = query.get("categoria", [None])[0]
            nivel = query.get("nivel", [None])[0]
            try:
                dispositivos = listar_dispositivos(
                    categoria=categoria, nivel=nivel, db_path=DB_PATH
                )
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "estado": "catalogo_cargado",
                        "total": len(dispositivos),
                        "dispositivos": dispositivos,
                    },
                )
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": f"Error al consultar BD: {exc}"})
            return

        if path == "/api/cotizaciones":
            folio = query.get("folio", [None])[0]
            try:
                cotizaciones = obtener_cotizaciones(folio=folio, db_path=DB_PATH)
                if folio and not cotizaciones:
                    self._send_json(404, {"ok": False, "error": "Folio no encontrado."})
                    return
                self._send_json(
                    200,
                    {"ok": True, "total": len(cotizaciones), "cotizaciones": cotizaciones},
                )
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": f"Error al consultar cotizaciones: {exc}"})
            return

        self._send_json(404, {"ok": False, "error": f"Ruta no encontrada: {path}"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/api/cotizaciones/calcular":
            try:
                body = self._read_json_body()
                resultado = calcular_cotizacion(
                    items=body.get("items") or [],
                    paso2=body.get("paso2"),
                    db_path=DB_PATH,
                )
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "estado": "calculado",
                        **resultado,
                    },
                )
            except LookupError as exc:
                self._send_json(404, {"ok": False, "error": str(exc)})
            except ValueError as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": f"Error interno al calcular: {exc}"})
            return

        if path == "/api/cotizaciones":
            try:
                body = self._read_json_body()
                cotizacion_creada = crear_cotizacion(body, db_path=DB_PATH)
                self._send_json(
                    201,
                    {
                        "ok": True,
                        "mensaje": "Cotización registrada correctamente en SQLite.",
                        **cotizacion_creada,
                    },
                )
            except LookupError as exc:
                self._send_json(404, {"ok": False, "error": str(exc)})
            except ValueError as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": f"Error interno al guardar: {exc}"})
            return

        self._send_json(404, {"ok": False, "error": f"Ruta POST no encontrada: {path}"})


def create_server(host: str = "0.0.0.0", port: int = 8000) -> ThreadingHTTPServer:
    """Inicializa la BD SQLite y crea la instancia del servidor HTTP."""
    init_db(DB_PATH)
    return ThreadingHTTPServer((host, port), PulsarAPIHandler)


if __name__ == "__main__":
    host = os.environ.get("PULSAR_API_HOST", "0.0.0.0")
    port = int(os.environ.get("PULSAR_API_PORT", "8000"))
    server = create_server(host, port)
    print(f"Pulsar API SQLite escuchando en http://{host}:{port} (BD: {DB_PATH})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo servidor API...")
        server.server_close()
