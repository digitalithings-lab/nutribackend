// Función de Vercel: entrega todas las peticiones a la API compilada en dist/.
module.exports = require("../dist/serverless.js").default;
