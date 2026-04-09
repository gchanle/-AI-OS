export const accessMethodMap = {
    connectors: {
        id: 'connectors',
        label: '连接器',
        summary: '适合系统入口、授权路径、浏览器流程、HTTP 接口和客户侧代理。',
        detail: '解决“怎么进入系统、怎么拿到结果、怎么审计”的问题。',
    },
    skills: {
        id: 'skills',
        label: 'Skills',
        summary: '适合把学校官方、超星官方和个人自建能力封装成可上架、可启用的能力单元。',
        detail: '解决“能力给谁用、如何审核、是否允许萤火虫调用”的问题。',
    },
    mcp: {
        id: 'mcp',
        label: 'MCP',
        summary: '适合第三方或校内服务以标准协议接入，便于结构化发现工具、资源和动作。',
        detail: '解决“远程服务如何以标准协议接入校园 OS”的问题。',
    },
    cli: {
        id: 'cli',
        label: 'CLI / 本地工具',
        summary: '适合校内部署、客户侧代理、本机浏览器和批处理命令类能力接入。',
        detail: '解决“没有 API，但本地环境能执行命令或脚本”的问题。',
    },
    vault: {
        id: 'vault',
        label: '凭证保险库',
        summary: '统一管理会话、令牌、账号密码兜底与授权可见性。',
        detail: '解决“能力接入需要的凭证和权限边界”问题。',
    },
};
