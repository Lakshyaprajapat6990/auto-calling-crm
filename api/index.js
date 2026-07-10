const server = require("../backend/server");

module.exports = (req, res) => {
  server.emit("request", req, res);
};
