module.exports = {
  apps: [
    {
      name: "web",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "worker",
      script: "npx",
      args: "tsx workers/message-sender.ts",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
