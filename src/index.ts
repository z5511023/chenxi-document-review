import './index.css';
import { ReviewAssistant } from './main';

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  console.log('[辰溪审核助手] 应用初始化开始...');
  const app = new ReviewAssistant();
  app.mount(document.getElementById('app')!);
  console.log('[辰溪审核助手] 应用初始化完成，事件监听已绑定');
});
