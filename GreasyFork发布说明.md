# 一系列FF14官网&商城功能优化

当前版本：**3.2.0**。

## 功能

1.进入FF14官网自动重定向至简约版(可开关)， 同时优化完善了简约版官网的标题栏内容；

2.FF14官网登录页面优化。主要包括：自动勾选同意协议、自动选择登录模式、登录账号选择、自动选择WeGame方式登录；

3.道具商城页面优化。主要包括：道具仓库物品批量领取；

4.商城页面展示游戏内已获取的道具(可开关，需要游戏内亚拉戈科技：[简易教程点击此处！！！请注意：游戏内任何插件以及脚本均违反SE与盛趣用户协议，请慎用](https://github.com/Angelways/ff14-official-mall-enhancements/blob/main/Docs/README.md))。

## 使用

安装后刷新目标页面，如提示脚本无法运行，请在 Tampermonkey 的扩展详情中按提示启用“允许运行用户脚本”。

批量领取适用于PC桌面端国服网页商城道具仓库，按钮位于仓库顶部。

脚本使用商城现有登录凭据请求仓库、大区、角色和领取接口。选择的大区、角色和官网开关保存在本地存储中。实际领取需要你主动选择道具并完成两次确认。自动勾选登录协议前，请自行阅读并确认相关协议。

主要使用 Chrome 验证；Edge、Firefox 安装 Tampermonkey 后原则上兼容。

## 作者与来源

- 合集维护、登录协议自动勾选、官网与界面优化：[Angelways](https://github.com/Angelways)，[Greasy Fork 主页](https://greasyfork.org/zh-CN/users/1650905-angelways)。
- FF14 道具仓库批量领取功能：[annangela](https://greasyfork.org/zh-CN/users/129402-annangela)。
- 许可证：GPL-3.0-or-later。
- [GitHub 源码、使用说明与反馈](https://github.com/Angelways/ff14-official-mall-enhancements)。
