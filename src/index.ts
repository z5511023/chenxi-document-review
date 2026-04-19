import './index.css';
import { ReviewAssistant } from './main';

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  const app = new ReviewAssistant();
  app.mount(document.getElementById('app')!);
});
