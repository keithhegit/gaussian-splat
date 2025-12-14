> # 📑 项目技术规格说明书：WebXR Gaussian Splat Portal (Pure Frontend)
>
> 版本: 2.0 (Red Team Optimized)
>
> 执行者: AI Agent / Senior Frontend Engineer
>
> 目标: 构建一个纯前端 WebXR 应用，实现“任意门”效果——在现实世界放置一个门框，透过门洞看到高斯泼溅 (Gaussian Splatting) 渲染的虚拟场景，并支持用户物理走进门内。
>
> ------
>
> ## 1. 核心技术栈与约束 (Strict Constraints)
>
> AI 在生成代码时必须严格遵守以下约束，不得引入未授权的库：
>
> - **Runtime**: 原生 **WebXR Device API** (不使用 8th Wall 或 AR.js)。
> - **Core**: **Three.js** (r160+)。
> - **Splat Engine**: **`@mkkellogg/gaussian-splats-3d`** (v0.4.1+)。
>   - *Critical*: 必须使用底层的 `SplatMesh` 或 `GaussianSplatMesh` 类集成到 Three.js 场景中。**严禁**使用该库自带的 `Viewer` 类（因为它会劫持 `requestAnimationFrame` 循环，导致 AR 失效）。
> - **Build**: **Vite** + **TypeScript** (Vanilla, 无框架开销)。
> - **Platform**: Android (Chrome) 优先。iOS 需降级提示使用 WebXR Viewer。
> - **Asset Logic**:
>   - **禁止**：在运行时解压 `.spz` (会导致主线程卡死，追踪丢失)。
>   - **强制**：前端只加载预处理好的 **`.ksplat`** (流式) 或 **`.splat`** 文件。
>
> ------
>
> ## 2. 核心渲染管线 (Render Pipeline)
>
> 这是项目成败的关键。为了实现“门内可见，门外透明”的遮罩效果，必须精确控制 **RenderOrder** 和 **Stencil Buffer**。
>
> ### 2.1 场景图结构 (Scene Graph)
>
> Plaintext
>
> ```
> Scene
> └── PortalGroup (THREE.Group) -> [放置在 AR 地面]
>     ├── PortalMask (Mesh)     -> [不可见] 1x2m 平面, 写入 Stencil
>     ├── DoorFrame (Mesh)      -> [可见] GLB 模型, 门框
>     └── SplatContainer (Group)-> [虚拟世界容器] 用于调整 Splat 的位置/旋转
>         └── SplatMesh         -> [内容] 高斯泼溅模型
> ```
>
> ### 2.2 渲染层级表 (The Golden Rules)
>
> 请严格按照此表配置材质属性：
>
> | **层级** | **对象名称**   | **几何体**   | **RenderOrder** | **Stencil 配置 (关键)**               | **Depth Write** | **作用**                                         |
> | -------- | -------------- | ------------ | --------------- | ------------------------------------- | --------------- | ------------------------------------------------ |
> | **0**    | **PortalMask** | Plane (1x2m) | **0** (最早)    | `Func: ALWAYS` `Ref: 1` `Op: REPLACE` | **False**       | 不可见。在屏幕缓冲区“挖洞”，将门洞区域标记为 1。 |
> | **1**    | **SplatMesh**  | SplatMesh    | **1**           | `Func: EQUAL` `Ref: 1`                | **False**       | 仅在 Mask 标记为 1 的区域绘制点云。              |
> | **2**    | **DoorFrame**  | GLB Model    | **2** (最晚)    | `Func: ALWAYS` `Ref: 1`               | **True**        | 实体门框。遮挡 Mask 的边缘锯齿，提供视觉边界。   |
>
> ### 2.3 穿梭状态机 (The Crossing State Machine)
>
> 系统需在每一帧检测用户位置，动态切换渲染模式：
>
> - **State A: Outside (门外)**
>   - *条件*: 相机位于门平面之前 (`Local Z > 0.1`).
>   - *行为*: **启用** Splat 的 Stencil Test (`stencilFunc = EQUAL`).
>   - *效果*: 只能通过门洞看到虚拟世界。
> - **State B: Inside (门内)**
>   - *条件*: 相机位于门平面之后 (`Local Z < -0.1`).
>   - *行为*: **禁用** Splat 的 Stencil Test (`stencilWrite = false`).
>   - *效果*: 虚拟世界全屏渲染，用户完全沉浸。
>   - *Note*: 0.1m 的缓冲区 (Hysteresis) 用于防止在门口画面闪烁。
>
> ------
>
> ## 3. 模块化开发指令 (Master Prompts for AI)
>
> 请按以下 **Phase** 顺序分步发送给 AI。**不要一次性生成所有代码，否则 AI 会产生幻觉。**
>
> ### 🟢 Phase 1: 基础设施与 WebXR 启动
>
> **Prompt 指令**:
>
> > "Context: 我们正在开发一个基于 Three.js 和 WebXR 的 AR 传送门。
> >
> > Task:
> >
> > 1. 初始化一个 Vite + Vanilla TypeScript 项目。
> > 2. 配置 `vite.config.ts` 启用 HTTPS (使用 @vitejs/plugin-basic-ssl)。
> > 3. 在 `src/main.ts` 中初始化场景 (`xr.enabled=true`, `alpha=true`)。
> > 4. 添加 `ARButton` 并请求 `hit-test` 特性。
> > 5. 实现 Hit-Test 循环：当识别到地面时，显示一个绿色的 Reticle (环形光标)。
> > 6. 确保代码结构清晰，将 AR 逻辑封装在 `XRManager` 类中。"
>
> ### 🟢 Phase 2: 遮罩逻辑验证 (The "Box Test")
>
> **Prompt 指令**:
>
> > "Context: 基础设施已就绪。现在我们需要验证传送门的核心渲染逻辑（暂不加载 Splat）。
> >
> > Task:
> >
> > 创建一个 PortalSystem.ts 类：
> >
> > 1. 创建 `PortalGroup`。
> >
> > 2. 添加 **Mask**: 1x2m 平面，材质设置 `colorWrite:false, stencilWrite:true, stencilRef:1, stencilFunc:ALWAYS, stencilZPass:REPLACE`，**renderOrder: 0**。
> >
> > 3. 添加 **DebugBox**: 红色立方体，放在 Mask 后面，材质设置 `stencilWrite:true, stencilFunc:EQUAL, stencilRef:1`，**renderOrder: 1**。
> >
> > 4. 添加 **Frame**: 一个简单的线框盒子包裹 Mask，**renderOrder: 2**。
> >
> > 5. **交互逻辑**: 点击屏幕将 Group 放置在 Reticle 位置。
> >
> >    - 关键算法: 实现 'Y-Axis Billboarding'。门必须垂直于地面，但要在 Y 轴上旋转以面向相机。不要直接用 lookAt(camera)，否则门会歪向天空。
> >
> >      Goal: 只有透过隐形的 Mask 才能看到红盒子。从侧面看盒子消失。"
>
> ### 🟢 Phase 3: 集成 Gaussian Splats
>
> **Prompt 指令**:
>
> > "Context: 遮罩逻辑验证通过。现在集成 @mkkellogg/gaussian-splats-3d。
> >
> > Task:
> >
> > 1. 修改 `PortalSystem`，加载 `assets/store.ksplat`。
> > 2. 获取生成的 `SplatMesh`。
> > 3. **Critical Hooks (必须执行)**:
> >    - 将 Phase 2 中的 Stencil 配置注入到 `SplatMesh.material` (Func=EQUAL, Ref=1)。
> >    - 强制设置 `splatMesh.frustumCulled = false` (防止侧视时视锥剔除导致内容消失)。
> >    - 设置 `splatMesh.renderOrder = 1`。
> > 4. 移除红色 DebugBox，将 SplatMesh 加入 Group。
> > 5. 添加代码调整 Splat 的 `rotation.x` (通常需要旋转 -90度) 和 `position`，使其地板对齐门框底部。"
>
> ### 🟢 Phase 4: 穿梭逻辑 (The "Magic")
>
> **Prompt 指令**:
>
> > "Context: 视觉效果已完成，现在实现“走进门内”的交互。
> >
> > Task:
> >
> > 在 PortalSystem 的 update(camera) 方法中：
> >
> > 1. 计算相机相对于 Portal Group 的局部坐标 `localPos`。
> > 2. 状态切换：
> >    - 如果 `localPos.z < -0.1` (进门): 设置 Splat 材质 `stencilWrite = false` (全屏显示)。
> >    - 如果 `localPos.z > 0.1` (出门): 设置 Splat 材质 `stencilWrite = true` (恢复遮罩)。
> > 3. 加载 `assets/door_frame.glb` 替换 Phase 2 的线框门。"
>
> ------
>
> ## 4. 资产准备清单 (Checklist for Human)
>
> 在运行代码前，请确保你已完成以下步骤：
>
> 1. **下载模型**: 从 Luma.ai 或 Polycam 获取原始模型。
> 2. **预处理 (必做)**:
>    - 打开 [SuperSplat](https://www.google.com/search?q=https://playcanvas.com/super-splat) (在线编辑器)。
>    - **Clean**: 删掉店铺周围多余的街道/天空。
>    - **Re-center**: 将店铺地板中心移动到 `(0,0,0)`。
>    - **Export**: 导出为 **`.ksplat`** 文件。
> 3. **放置**: 将文件重命名为 `store.ksplat`，放入 `public/assets/` 文件夹。
>
> ------
>
> ### 🚀 调试指南 (Troubleshooting)
>
> - **问题**: 手机上 Splat 加载极慢或崩溃。
>   - *原因*: 你使用了 `.spz` 或原始 `.ply`。
>   - *解决*: 转为 `.ksplat`。
> - **问题**: 侧面看门，里面的东西突然消失了。
>   - *原因*: Three.js 的视锥体剔除 (Frustum Culling) 误判。
>   - *解决*: 检查代码是否执行了 `splatMesh.frustumCulled = false`。
> - **问题**: 门歪了，指向天空。
>   - *原因*: 直接使用了 `lookAt(camera)`。
>   - *解决*: 检查 Phase 2 的 Y-Axis Billboarding 算法。