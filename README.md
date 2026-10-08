# 一系列FF14官网&商城功能优化

用于 Tampermonkey 的 FF14 官网与盛趣商城功能合集，当前版本 **3.1.2**。

## 功能

- 盛趣登录页面自动勾选“我已阅读并同意”，支持动态登录框及 iframe。手动取消后，本次页面尊重你的选择。
- FF14 道具仓库顶部显示“批量领取道具”，可选择仓库、道具、大区和角色，再确认批量领取。入口适配宽屏与窄屏，支持页面异步更新。
- 进入 FF14 完整版首页时自动转到简约版，默认开启，可在 Tampermonkey 菜单或简约版导航中关闭。
- 简约版官网补充新闻中心、游戏资料、客户服务、相关网站、商城、充值等导航。

## 安装

需要 Chrome、Edge 或 Firefox，以及 [Tampermonkey](https://www.tampermonkey.net/)。主要使用 Chrome 验证。

[在 Greasy Fork 安装](https://greasyfork.org/zh-CN/scripts/599251) · [从 GitHub 安装](https://raw.githubusercontent.com/Angelways/ff14-official-mall-enhancements/main/ff14-official-mall-enhancements.user.js)

打开安装链接并按 Tampermonkey 提示安装；也可下载 `.user.js` 后从 Tampermonkey 的“实用工具”导入文件。安装后刷新目标页面，保持此合集只启用一个实例。

详细使用说明见 [安装说明.md](安装说明.md)。Chrome 如提示脚本无法运行，请在 Tampermonkey 扩展详情中按提示启用“允许运行用户脚本”。

## 批量领取

在 `qu.sdo.com/personal-center` 或 `mall.sdo.com/personal-center` 的 FF14 道具仓库点击顶部按钮，选择道具、确认数量，选择大区与角色，再确认领取。每次最多加载 100 件道具，领取完成后自动刷新。

脚本通过商城接口携带商城登录凭据获取仓库、大区、角色和领取结果。选择的大区与角色、自动进入简约版开关保存在 Tampermonkey 本地存储中。不会自动提交登录，也不会未经你选择和确认执行领取。

自动勾选登录协议前，请自行阅读并确认相关协议。仓库入口仅适用于桌面商城。

## 作者与许可证

- 合集维护、登录协议自动勾选、官网与界面优化：[Angelways](https://github.com/Angelways)。[Greasy Fork 主页](https://greasyfork.org/zh-CN/users/1650905-angelways)。
- FF14 道具仓库批量领取功能：[annangela](https://greasyfork.org/zh-CN/users/129402-annangela)。
- 许可证：[GPL-3.0-or-later](LICENSE.txt)。

## 验证与反馈

已在独立 Chrome 中验证登录勾选、仓库入口与布局、页面更新后的入口恢复，以及模拟接口下的批量领取流程。另验证了真实官网简约版导航。测试未执行真实账号的道具领取。

问题反馈请提交 [GitHub Issue](https://github.com/Angelways/ff14-official-mall-enhancements/issues)，附页面地址、浏览器及脚本版本，并描述复现步骤。请勿上传账号、密码或登录凭据。

GitHub `main` 分支中的 `ff14-official-mall-enhancements.user.js` 用于 Greasy Fork 自动定期同步；页面说明从 `GreasyFork发布说明.md` 同步。后续更新脚本时应同时递增 `@version`。
