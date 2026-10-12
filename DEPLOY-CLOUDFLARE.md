# Cloudflare Pages 部署

Git 项目：KnowledgeJuCrab/Zhaosheng，生产分支 main。

在 Pages 项目“设置 → 构建 → 构建配置”中设置：

| 项目 | 值 |
| --- | --- |
| 框架预设 | None |
| 构建命令 | npm run build |
| 构建输出目录 | dist |
| 根目录 | 留空 |

`npm run build` 生成 `dist/index.html`、静态资源和 Pages 高级模式的 `dist/_worker.js`。不要发布仓库根目录，也不要发布原平台专用的 `dist/server`。原平台构建另用 `npm run build:sites`。

## 后台与内容

当前已迁移原站第 9 版的九个自定义篇章及九张上传图片。没有绑定数据库时，前台展示 `src/published-content.json` 的完整快照，字号、图片取景和文字位置均保留；迁移图片位于 `public/media/`，校验值见 `src/published-media.json`。没有内容快照时才使用 `src/default-content.json` 的示例内容。原后台的后续修改需要重新导出同步；新平台的存储和登录配置完成前，后台显示配置提示并拒绝写入。

启用 Cloudflare 后台需要：

1. 创建 D1 数据库，执行 `drizzle/0000_amazing_reaper.sql`，在 Pages 中绑定为 `DB`。
2. 创建 R2 桶，在 Pages 中绑定为 `BUCKET`；迁移图片时保留原 `/media/<文件名>` 对应的对象名称。
3. 为生产域名的 `/admin` 和 `/admin/*` 配置同一 Cloudflare Access 应用，只允许管理员邮箱访问。保持 `/api/content` 可公开读取；服务端会校验 API 写入请求中 Access 签发的 `CF_Authorization` Cookie。不要把整个公开首页设置成必须登录。
4. 在 Pages 中配置运行时变量 `ACCESS_TEAM_DOMAIN`（例如 `https://your-team.cloudflareaccess.com`）、`ACCESS_AUD`（Access 应用的 Audience）和 `ADMIN_EMAILS`（允许编辑内容的邮箱，以逗号分隔）。实际管理员邮箱只保存在平台变量中。
5. 将导出的内容记录导入 `site_content`，将上传图片导入 R2，再重新部署。

后台校验 Cloudflare Access JWT 的签名、签发者、Audience、有效期和管理员邮箱。直接传入原平台身份请求头不会获得管理权限。原站的 ChatGPT 登录不能自动用于 Cloudflare Pages。

## 验证

`npm test` 验证 CMS、九篇章循环导航和 Pages 权限适配。部署后确认 `/`、`/app.js`、`/styles.css`、`/api/content` 均返回成功；分别检查桌面与手机视图。Cloudflare 构建日志应显示执行了 `npm run build`，并识别和编译 `_worker.js`。
