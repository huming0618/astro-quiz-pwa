# 月食互动实验室

独立静态网页，入口 `./index.html`，GitHub Pages 路径 `/astro-quiz-pwa/eclipse/`。无需构建或 CDN。Three.js r170 与 OrbitControls 从官方仓库下载到 `vendor/`，仅将 OrbitControls 的 `three` 模块导入改为本地路径；MIT 许可随附。

## 使用

- 普通满月 / 月食满月 / 0° 倾角三组对照。
- 单指拖动旋转；双指缩放并旋转；鼠标拖动与滚轮也可用。
- 侧视看离开黄道面的高度；俯视看太阳与交点方向；沿地影看与横截面对照。
- 年度滑块改变地影方向，默认同时放到该方向的满月；月球滑块独立改变月内轨道位置。
- 播放按平均恒星月与恒星年的速率同时推进，不把一个恒星月误当一个朔望月；下一个满月数值求根到下一次投影方向对齐。

## 模型与边界

长度单位为地球半径：地月距 60.3，月球半径 .273，日地距 23455，太阳半径 109.1。月球轨道倾角 5.145°，固定交点，圆轨道。本影 / 半影截锥在背太阳方向，判食基于该方向轴向坐标 > 0、垂直距离与当地影锥截面圆盘重叠。主场景距离与球体按比例；月球/地球定位圈、线宽、交点标记不按比例。横截面独立自适应缩放但内部相对比例一致。

忽略椭圆轨道、交点退行、大气折射等；近似截面几何用于教学，不作真实日期或精密食分预测。0° 为反事实共面实验，原交点只作参考方向。月食发生时月球材质只用示意色，不是基于大气的光度模型。

## 非浏览器验证

```sh
node eclipse/tests/model.test.mjs
node eclipse/tests/static.test.mjs
node --check eclipse/app.mjs
```

13 组几何测试，包括 259,200 个年度 / 月内位置组合的扫描：普通满月、双交点全食、新月不月食、偏食/半影、0°每次满月、真实恒星月/年速率、下一满月求根。静态测试检查资源和 ESM 依赖、DOM ID、事件绑定、触摸配置、响应式基础及 WebGL 失败提示。另以 Node 实际载入 Three.js 与 OrbitControls 模块验证导出。

未使用浏览器或截图工具。发布后需在桌面 Chrome / Safari 与手机检查：首屏构图、标签重叠、三种情景、视角切换、滑块触摸与页面滚动、双指缩放、播放暂停、无 WebGL 提示，以及原答题流程。服务端 HTTP 检查不等于浏览器视觉或 GPU 验证。


## 真实日期预报模块（2026-11-22 更新，北京时间）

`forecast-core.mjs` 为纯计算层，`forecast.mjs` 为日期搜索、地图与地点交互。二者与上方 `model.mjs` / `app.mjs` 教学模型独立。

- `vendor/astronomy-engine.mjs`：npm 官方 Astronomy Engine **2.1.19** 的 `esm/astronomy.js` 原样保存，无 CDN / 网络计算服务。MIT 许可另附。
- 搜索以北京时间起始日零时为下限，按**食甚时刻**筛选。先向前回溯一天调用 SearchLunarEclipse，避免食甚与满月恰跨日期被漏掉，再用 NextLunarEclipse 连续搜索。
- 接触时刻使用 `peak ± sd_penum/partial/total`，仅到分钟显示；不存在的接触阶段为 null，明确“不发生”。这是库半时长 API 的对称重建，并非独立的高精度逐接触预报。
- 地图：当日真赤道坐标、GAST、扁球地球海平面观察者矢量，按月心地平高度 h>0 上色，包含地平视差。不加折射。1° 栅格 + marching squares 白色边界。太阳 h<0 的夜区独立叠加，不把夜半球冒充可见区。
- 所选地另用 Equator + Horizon（ofdate=true，无折射），给出各接触月球高度。SearchAltitude 以月心 h=0 给出附近几何月出月落；3 分钟采样与二分细化，求全过程地平线上方覆盖区间。
- 默认成都只是示例，经纬输入或地图轻点均可改。海拔按0；近地平线不考虑山地、遮挡、气象及折射，不能保证实际可见。
- Natural Earth 1:110m 陆地轮廓以本地 GeoJSON 提供，为公共领域；若底图失败，经纬网和区域计算仍正常。时间滑块重绘延迟110ms，不在3D每帧计算世界地图。

### 独立核验

`research/nasa-reference.json` 的数值逐项抄自 NASA GSFC / Fred Espenak 两场月食图的 **UT** 标签（原 PDF 是扫描图，转 PNG 后直接核对，未混用 TD）。`research/validation.json` 为脚本计算的未取整差值：

| 事件（北京时间日期） | 最大接触时刻绝对误差 | 食甚误差 |
|---|---:|---:|
| 2026-03-03 全食 | 0.628 分钟 | +0.0548 分钟 |
| 2026-08-28 偏食 | 0.404 分钟 | +0.00127 分钟 |

样本误差不是全时段误差上限。NASA 使用 Danjon 影子规则，库以地球平均半径 + 88km 有效大气层建影；星历、ΔT、半径阈值与对称时间重建均有差别。全站明确不承诺秒级精度。

```sh
node eclipse/tests/forecast.test.mjs          # 14 组日期/星历/地平线测试
node eclipse/tests/forecast.test.mjs --write  # 重生成 validation.json
node eclipse/tests/model.test.mjs             # 原有 13 组教学几何测试
node eclipse/tests/static.test.mjs            # 所有本地资源/ESM/DOM/触摸基础
node eclipse/tests/forecast-ui-smoke.test.mjs # Node DOM桩，实际事件流程；不测布局/像素
```

地图矢量路径与库 Equator/Horizon 在651个坐标/时刻比较，最大高度差约 6.1e-11°；这是内部实现一致性，不是实际星历精度声明。测试包含日期校验、缺失接触、跨日搜索、极点/日期变更线、视差边界、月下点/对跖点、与夜半球不重合、成都月落截断覆盖。

默认2026-11-22后第一场为北京时间 **2027-02-21 07:13** 半影月食（分钟取整）。成都示例可覆盖约143分钟，到约07:35几何月落为止。实际月缘出现/消失、天空亮度等会不同。

浏览器 QA 仍需：手机窄屏无横向溢出、原3D单指/双指操作；预报初次载入、示例全食/偏食/默认半影阶段缺失；日期搜索、4场选择/再找4场；接触按钮和时间滑块；地图点选和手动经纬；日界线/极区；验证表折叠；原448题答题功能。非浏览器测试不能代替实际渲染或真实手机触摸检查。

## r7：旧页面缓存迁移（2026-11-22，北京时间）

现象：浏览器仍显示旧3D页面；但独立HTTP检查 `/eclipse/`、`/eclipse/index.html`、带query与Cache-Control:no-cache请求均取得含forecast的20556字节HTML，SHA256一致，远端Pages为预报提交6efc5cf、gh-pages根目录且built。响应GitHub Pages设max-age=600，可能存在不同客户端/边缘缓存；不能仅凭box出口替另一个浏览器证明已刷新。

代码中已证实的旧缓存缺陷：v4 worker对全部GET（包含HTML导航）优先`caches.match`返回旧副本，后台更新没有`event.waitUntil`保活；lesson页面又不主动注册/更新根worker，只有答题首页这样做。Node VM测试可复现服务器已返回forecast但同URL仍收到旧3D文档。`ignoreSearch`并未开启；旧worker对新query/新路径是cache miss。实际QA浏览器的active worker/响应来源仍须其开发者工具确认，不把推断写成已经读取过用户浏览器。

修复：
- 全新未缓存入口 `eclipse/forecast.html`，内容与index.html相同，标记data-build=20261122-r7，顶部可见“预报更新版 · r7”。原入口保留完整内容。
- 每个lesson入口都加载update.mjs，显式注册/更新根worker，updateViaCache=none。旧controller替换后最多刷新一次该教学页，不刷新答题页，不访问/清除错题localStorage。
- v7导航与lesson资源使用网络优先并以cache:no-cache重验证HTTP缓存；lesson不写CacheStorage，断网明确提示而不冒充旧预报。答题保留离线HTML/题库回退。
- 清理只限astro-quiz-*旧cache，保留其他应用cache。初始化precaches用cache:reload。CSS/页面模块带release query；核心预报模块也有release query。
- GitHub Pages的max-age由托管方控制，静态仓库不能自行保证各CDN边缘瞬时更新。全新路径用于迁移旧客户端；今后的构建应同步更新release标签并同步生成两个入口。

`node eclipse/tests/cache.test.mjs` 回归覆盖旧缺陷、query/path逃离旧缓存、新策略、离线回退、cache清理范围和双入口一致。浏览器QA应先打开新forecast.html入口确认r7，再回原/eclipse/#forecast并确认active worker为v7；无需清站点数据，不能以清空localStorage解决缓存。
