const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "development",
  entry: "./src/index.js",
  output: {
    filename: "index.js",
    path: path.resolve(__dirname, "dist"),
  },
  plugins: [
    new CopyWebpackPlugin([
      { from: "./src/list-item.html", to: "list-item.html" },
      { from: "./src/product.html", to: "product.html" },
      { from: "./src/index.html", to: "index.html" },
    ]),
  ],
  devServer: { contentBase: path.join(__dirname, "dist"), compress: true },
};
