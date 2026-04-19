/// <reference types="vite/client" />

// Vite ?url import 声明：将文件作为静态资源引入，返回编译后的 URL 路径
declare module '*.mjs?url' {
  const url: string;
  export default url;
}
declare module '*?url' {
  const url: string;
  export default url;
}
