module.exports = {
  apps: [
    {
      name: "web",
      script: "./node_modules/.bin/react-router-serve",
      args: "./build/server/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "worker",
      script: "./node_modules/.bin/tsx",
      args: "workers/message-sender.ts",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
