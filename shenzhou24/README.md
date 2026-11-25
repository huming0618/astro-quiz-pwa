# 神舟二十四号发射与对接演示

在线地址：https://huming0618.github.io/astro-quiz-pwa/shenzhou24/

用本地 vendored 的 Three.js 做触摸友好的 WebGL 教学页，演示 2026 年 11 月 25 日神舟二十四号从酒泉卫星发射中心到天宫空间站的行程。

## 三类信息

- **官方公布**：发射时刻北京时间 08:18、乘组（汤洪波、武毅、穆罕默德·齐尚·阿里）、入轨后优先采用 3.5 小时自主快速交会对接、对接天和核心舱前向端口、形成三船三舱组合体。新华社于 08:19 左右发布点火快讯。
- **同型通常时序**：逃逸塔 / 助推器 / 一二级 / 整流罩 / 船箭分离的秒数取长征二号 F 公开的通常时序（如神舟十四号主任设计师常武权的介绍：120、152、156、210、585 秒），不是本次正式公报的精确秒数。抛塔高度约 39 公里同理。
- **教学示意**：入轨轨道根数、多圈过渡、径向绕飞、前向 V-bar 逼近、11:48 接触与 11:50 拉拢锁紧，都不是飞控弹道。空间站轨道取倾角 41.5°、高度约 400 公里量级，不要写成天宫二号的 393 公里，也不要与现在的天宫空间站混淆。

## 技术

- Three.js 与 OrbitControls 放在 `vendor/`，页面不使用 CDN。
- 陆地轮廓为 Natural Earth 1:110m（公有领域），见 `vendor/NOTICE.natural-earth.txt`。
- 新入口由根目录 `sw.js` 以导航 / 教学资源 network-first（`cache: no-cache`）处理，且不写入 CacheStorage。本页加载 `update.mjs` 注册并更新根 service worker。

`node shenzhou24/tests/mission.test.mjs` 与 `node shenzhou24/tests/static.test.mjs` 覆盖轨道几何、时序标签和“禁止 CDN / 缓存策略”检查。
