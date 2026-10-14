const params = new URLSearchParams(location.search);
const view = params.get('view');
if (view === 'head') import('./dev/headView').then((m) => m.run());
else if (view === 'char') import('./dev/charView').then((m) => m.run());
else if (view === 'face') import('./dev/faceView').then((m) => m.run());
else if (view === 'export') import('./dev/exportView').then((m) => m.run());
else import('./app').then((m) => m.start());
