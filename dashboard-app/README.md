# Dashboard (Cozy app)

Drag-and-drop personal dashboard with widgets (recent files, recent notes,
kan.bn tasks, quick capture). Built with cozy-scripts / cozy-client / cozy-ui
+ react-grid-layout.

## Dev

    npm install --legacy-peer-deps
    npm run build

Install on a Cozy instance:

    cozy-stack apps install --domain <instance> dashboard \
      file:///home/mmaudet/work/dev.twake.ai/dashboard-app/build
