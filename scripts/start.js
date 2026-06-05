const cp = require('child_process');
const path = require('path');
const electronPath = require('electron');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const child = cp.spawn(electronPath, ['.'], {
  cwd: path.join(__dirname, '..'),
  env,
  detached: true,
  stdio: 'ignore'
});

child.unref();
console.log('桌面图标收纳盒已启动');
