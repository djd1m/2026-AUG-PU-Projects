FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /opt/browser
RUN npm init -y && npm install --save-exact playwright@1.63.0
RUN chown -R pwuser:pwuser /opt/browser
USER pwuser
CMD ["node", "node_modules/playwright/cli.js", "run-server", "--port", "9320", "--host", "0.0.0.0"]
