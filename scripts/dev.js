const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const electronPath = require('electron');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

// 启用远程调试端口
const debugPort = 9222;
const args = process.argv.includes('--debug') ? [`--remote-debugging-port=${debugPort}`] : [];

let child = null;
const srcDir = path.join(__dirname, '..', 'src');

function startApp() {
  child = cp.spawn(electronPath, ['.', ...args], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: 'inherit'
  });

  child.on('exit', (code) => {
    if (code !== null) {
      console.log(`应用已退出，代码: ${code}`);
    }
  });

  console.log('桌面图标收纳盒已启动 (开发模式)');
  if (args.length > 0) {
    console.log(`调试端口: ${debugPort}`);
  }
}

function restartApp() {
  if (child) {
    console.log('\n检测到代码变更，正在重启...');
    child.kill();
    child = null;
    setTimeout(startApp, 1000);
  } else {
    startApp();
  }
}

// 文件监听配置
const watchOptions = {
  recursive: true,
  persistent: true
};

// 监听源代码目录
fs.watch(srcDir, watchOptions, (eventType, filename) => {
  if (filename && !filename.endsWith('.log')) {
    console.log(`文件变更: ${filename}`);
    restartApp();
  }
});

console.log(`正在监听 ${srcDir} 目录变更...`);
console.log('按 Ctrl+C 停止监听');

// 启动应用
startApp();
