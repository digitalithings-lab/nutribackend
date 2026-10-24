// Función de Vercel: entrega todas las peticiones a la API compilada en dist/.
// Si la API no puede arrancar (p. ej. falta una variable de entorno), responde con el motivo
// en lugar de un error genérico, para poder diagnosticarlo sin abrir los logs.

function startupError(err) {
  // Quita usuario y contraseña de cualquier URL de conexión que aparezca en el mensaje.
  const reason = String((err && err.message) || err).replace(/\/\/[^@\s/]+@/g, "//***@");
  console.error("La API no pudo iniciar:", err);
  return (req, res) => {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "error", message: "La API no pudo iniciar", reason }));
  };
}

let handler;
try {
  const api = require("../dist/serverless.js").default;
  handler = async (req, res) => {
    try {
      await api(req, res);
    } catch (err) {
      startupError(err)(req, res);
    }
  };
} catch (err) {
  handler = startupError(err);
}

module.exports = handler;
