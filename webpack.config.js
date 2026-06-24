const path = require("path");

const shared = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".json"]
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      }
    ]
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: false
  }
};

module.exports = [
  {
    ...shared,
    name: "main",
    target: "electron-main",
    externals: {
      "node-pty": "commonjs2 node-pty"
    },
    entry: {
      "main/electron-main": "./src/main/electron-main.ts",
      "main/preload": "./src/main/preload.ts"
    }
  },
  {
    ...shared,
    name: "renderer",
    target: "electron-renderer",
    entry: {
      "renderer/workbench-app": "./src/renderer/workbench-app.tsx"
    }
  },
  {
    ...shared,
    name: "node-services",
    target: "node20",
    entry: {
      "services/caval-runtime": "./src/caval-runtime.ts"
    }
  }
];
