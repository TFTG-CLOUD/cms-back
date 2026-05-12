module.exports = {
  apps: [
    {
      name: 'cms-back',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 6002
      }
    }
  ]
};
