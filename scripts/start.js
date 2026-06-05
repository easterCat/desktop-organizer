const cp = require('child_process');
const path = require('path');
const electronPath = require('electron');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

// 启用远程调试端口
const debugPort = 9222;
const args = process.argv.includes('--debug') ? [`--remote-debugging-port=${debugPort}`] : [];

const child = cp.spawn(electronPath, ['.', ...args], {
  cwd: path.join(__dirname, '..'),
  env,
  detached: true,
  stdio: 'ignore'
});

child.unref();
console.log('桌面图标收纳盒已启动');
if (args.length > 0) {
  console.log(`调试端口: ${debugPort}`);
}
