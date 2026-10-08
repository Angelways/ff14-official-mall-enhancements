# 一系列FF14官网&商城功能优化

## 功能

- **登录协议自动勾选**：在盛趣登录页面自动勾选“我已阅读并同意”，支持动态登录框和 iframe。手动取消勾选后，本次页面尊重你的选择。
- **FF14 道具仓库批量领取**：仓库顶部显示“批量领取道具”，选择仓库、道具、大区与角色，并完成确认后按顺序领取。每次最多加载 100 件，完成后自动刷新。
- **进入官网时自动重定向至简约版**：默认开启，可在 Tampermonkey 菜单或简约版顶部导航中关闭。
- **简约版导航补充**：显示新闻中心、游戏资料、客户服务、相关网站、商城、充值等入口，支持下拉菜单。

## 使用

安装后刷新目标页面，保持此合集只启用一个实例。Chrome 如提示脚本无法运行，请在 Tampermonkey 的扩展详情中按提示启用“允许运行用户脚本”。

批量领取适用于桌面商城 `https://qu.sdo.com/personal-center` 和 `https://mall.sdo.com/personal-center` 的 FF14 道具仓库。按钮位于仓库顶部，空间不足时独立一行显示。

脚本使用商城现有登录凭据请求仓库、大区、角色和领取接口。选择的大区、角色和官网开关保存在 Tampermonkey 本地存储中。实际领取需要你主动选择道具并完成两次确认。自动勾选登录协议前，请自行阅读并确认相关协议。

主要使用 Chrome 验证；Edge、Firefox 安装 Tampermonkey 后原则上兼容。测试未执行真实账号的道具领取。

## 作者与来源

- 合集维护、登录协议自动勾选、官网与界面优化：[Angelways](https://github.com/Angelways)，[Greasy Fork 主页](https://greasyfork.org/zh-CN/users/1650905-angelways)。
- FF14 道具仓库批量领取功能：[annangela](https://greasyfork.org/zh-CN/users/129402-annangela)。
- 许可证：GPL-3.0-or-later。
- [GitHub 源码、使用说明与反馈](https://github.com/Angelways/ff14-official-mall-enhancements)。
