module.exports = {
  apps: [
    {
      name: "web",
      script: "./node_modules/.bin/react-router-serve",
      args: "./build/server/index.js",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3000,
      },
    },
    {
      name: "reconnect",
      script: "./node_modules/.bin/tsx",
      args: "workers/reconnect-sessions.ts",
      env: {
        NODE_ENV: "production",
      },
      // Restart if it crashes, but wait 30 seconds
      restart_delay: 30000,
      max_restarts: 3,
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
