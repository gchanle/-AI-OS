# 登录对接说明

日期：2026-04-13

## 目标

当前版本已经将校园用户身份统一收口到前端全局用户资料源中。

研发在接入公司统一登录页后，不需要逐个修改消息、审批、Firefly、定时任务等请求的 `uid` 取值逻辑，只需要在登录成功后把用户资料按约定传给 AI 校园 OS，系统就会统一写入本地 profile，后续页面和请求都从这里读取。

## 全局用户资料源

统一入口文件：

- `data/userProfile.js`

全局注入组件：

- `components/CampusUserBootstrap.js`

当前前台与后台页面都会自动消费登录回传参数，并写入本地 `localStorage`：

- key: `campus_user_profile_v1`

## 推荐接入方式

登录成功后，把用户资料拼在跳转 URL 上带入 AI 校园 OS。

### 推荐参数

- `campus_uid`
- `campus_fid`
- `campus_user_name`
- `campus_chaoxing_name`
- `campus_role`
- `campus_permissions`
- `campus_avatar`

### 示例

```text
https://your-campus-os-domain.com/?campus_uid=u123456&campus_fid=f10001&campus_user_name=%E5%BC%A0%E8%80%81%E5%B8%88&campus_role=teacher&campus_permissions=admin:school_console,workspace:research
```

页面加载后会自动：

1. 读取以上参数
2. 规范化为统一用户资料
3. 写入 `localStorage`
4. 清理 URL 中的登录参数，避免持续暴露在地址栏

## 字段说明

### 必填

- `campus_uid`

建议也同时传：

- `campus_fid`

如果没有传的字段，系统会使用当前默认占位值或保留已有值。

### 角色建议值

- `student`
- `teacher`
- `operator`
- `school_admin`
- `platform_admin`

### 权限格式

`campus_permissions` 使用逗号分隔，例如：

```text
admin:school_console,workspace:research,workspace:services
```

## 清空演示身份

如果研发在退出登录时希望恢复默认演示资料，可以跳转：

```text
https://your-campus-os-domain.com/?campus_clear_profile=true
```

系统会自动重置为默认演示账号，并清理该参数。

## 当前业务请求如何取 UID

当前产品里，以下能力已经从统一用户资料中取 `uid / fid` 再发给后端：

- Firefly 对话与任务执行
- 未读消息
- 审批待办
- 定时任务
- 能力市场安装态
- 右侧个人空间

因此，登录接入完成后，不需要分别去每个功能模块改 `uid`。

## 后续建议

如果后面公司登录体系希望改成服务端 session / cookie 模式，也建议继续保留 `data/userProfile.js` 作为前端统一用户上下文出口，让页面组件只依赖这一层，不直接耦合登录实现细节。
