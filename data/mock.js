// Mock data for AI Campus platform
import React from 'react';
import { campusCapabilities, defaultCapabilityIds } from './workspace';

// Icons 
const IconPaper = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>;
const IconExam = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
const IconResearch = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>;
const IconQA = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
const IconService = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
const IconIdea = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
const IconJob = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>;
const IconBrain = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>;
const IconEarth = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
const IconClock = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const IconMail = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /></svg>;
const IconTarget = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;

export const workflowActions = [
  { id: 1, icon: <IconClock />, title: '一键拉取', desc: '本周所有待交作业与Deadline', action: '帮我拉取教务系统和学工系统中本周所有的作业和Deadline' },
  { id: 2, icon: <IconTarget />, title: '深度预估', desc: '机器学习期末高频痛点', action: '根据大纲预估机器学习期末考试高频重难点' },
  { id: 3, icon: <IconPaper />, title: '帮我规划', desc: '本月考研复习时间轴', action: '基于我现在的教务课表，帮我规划本月的考研复习时间轴' },
  { id: 4, icon: <IconMail />, title: '快速解读', desc: '今天收到的3封未读通知', action: '帮我快速总结并解读今天收到的系统未读通知' },
];

export const historyChats = [
  { id: 1, title: '帮我分析机器学习期末考试重点', time: '今天 14:30', preview: 'AI: 根据课程大纲，以下是重点...' },
  { id: 2, title: '论文格式修改建议', time: '今天 10:15', preview: 'AI: 你的论文格式需要注意...' },
  { id: 3, title: '深度学习作业第三题', time: '昨天 21:00', preview: 'AI: 这道题需要使用反向传播...' },
  { id: 4, title: '实验室设备预约流程', time: '昨天 16:45', preview: 'AI: 预约流程如下...' },
  { id: 5, title: '奖学金申请材料准备', time: '3月8日', preview: 'AI: 申请需要以下材料...' },
  { id: 6, title: '英语四级备考计划', time: '3月7日', preview: 'AI: 建议你从听力开始...' },
  { id: 7, title: '毕业论文选题讨论', time: '3月6日', preview: 'AI: 关于选题方向...' },
];

export const todayCourses = [
  { id: 1, name: '机器学习', time: '08:00 - 09:40', location: '教学楼 A301', teacher: '张教授', color: '#0066CC' },
  { id: 2, name: '深度学习理论', time: '10:00 - 11:40', location: '教学楼 B205', teacher: '李教授', color: '#5AC8FA' },
  { id: 3, name: '计算机视觉', time: '14:00 - 15:40', location: '实验楼 C102', teacher: '王教授', color: '#34C759' },
];

export const serviceProgress = [
  { id: 1, name: '创新创业奖学金申请', status: 'processing', progress: 60, department: '学工处', date: '2026-03-05' },
  { id: 2, name: '校外实践请假申请', status: 'approved', progress: 100, department: '教务处', date: '2026-03-03' },
  { id: 3, name: '实验室设备借用预约', status: 'pending', progress: 30, department: '设备处', date: '2026-03-08' },
  { id: 4, name: '勤工俭学岗位申请', status: 'processing', progress: 45, department: '学工处', date: '2026-03-07' },
];

export const notifications = [
  { id: 1, title: '关于2026年春季学期选课的通知', type: 'important', time: '2小时前', read: false },
  { id: 2, title: '图书馆延长开放时间公告', type: 'info', time: '5小时前', read: false },
  { id: 3, title: '第十届大学生创新创业大赛报名', type: 'event', time: '1天前', read: true },
  { id: 4, title: 'AI实验室招募本科生助研', type: 'opportunity', time: '2天前', read: true },
  { id: 5, title: '校园网升级维护通知', type: 'info', time: '3天前', read: true },
];

export const mockMessages = [
  { id: 1, sender: '教务处', content: '你的选课申请已通过考核。', time: '10:30', unread: true },
  { id: 2, sender: '系统通知', content: '密码安全提醒：将于3天后过期。', time: '昨天', unread: false },
];

export const mockNews = [
  { id: 1, title: '2026年春季运动会报名通知', date: '03-10' },
  { id: 2, title: '第四届AI创新大赛开赛，丰厚奖金等你拿', date: '03-09' },
  { id: 3, title: '校长办公室关于加强校园非机动车管理的规定', date: '03-08' },
];

export const mockSchedules = [
  { id: 1, title: '导师课题组会', time: '14:30 - 16:00', type: 'meeting' },
  { id: 2, title: '提交编译原理大作业', time: '23:59截止', type: 'deadline' },
];

export const mockApprovals = [
  { id: 1, title: '学生出校报备审批', status: 'pending', time: '今天 09:00' },
  { id: 2, title: '科研竞赛经费报销申请', status: 'processing', time: '昨天 15:00' },
];

export const mockFavoriteServices = [
  { id: 1, name: '成绩查询', iconType: 'exam' },
  { id: 2, name: '课表查询', iconType: 'calendar' },
  { id: 3, name: '图书借阅', iconType: 'library' },
  { id: 4, name: '校园卡', iconType: 'card' },
];

export const mockRecentServices = [
  { id: 1, name: '宿舍报修', iconType: 'repair' },
  { id: 2, name: '班车查询', iconType: 'bus' },
  { id: 3, name: '食堂菜单', iconType: 'food' },
  { id: 4, name: '医疗预约', iconType: 'medical' },
];

export const featureCards = [
  { id: 1, icon: <IconPaper />, title: '论文助手', desc: '智能润色、格式调整、查重预检' },
  { id: 2, icon: <IconExam />, title: '考试查询', desc: '成绩查询、考试安排、学分统计' },
  { id: 3, icon: <IconResearch />, title: '科研助手', desc: '文献搜索、数据分析、实验设计' },
  { id: 4, icon: <IconQA />, title: '学术问答', desc: '课程答疑、知识解析、学习规划' },
  { id: 5, icon: <IconService />, title: '校园服务', desc: '办事指南、流程查询、预约服务' },
  { id: 6, icon: <IconIdea />, title: '创新创业', desc: '项目孵化、比赛指导、团队组建' },
];

export const sampleQuestions = [
  '帮我分析一下机器学习期末考试的重点内容',
  '如何申请创新创业奖学金？需要哪些材料？',
  '推荐几本深度学习入门的书籍',
  '帮我写一份实验报告的引言部分',
  '本学期的选课时间是什么时候？',
  '如何预约图书馆的研讨室？',
];

export const agentList = campusCapabilities.map((capability) => ({
  id: capability.id,
  name: capability.name,
  desc: capability.source,
  enabled: defaultCapabilityIds.includes(capability.id),
  icon:
    capability.id === 'services' ? <IconService /> :
    capability.id === 'research' ? <IconResearch /> :
    capability.id === 'assistant' ? <IconExam /> :
    capability.id === 'library' ? <IconEarth /> :
    <IconBrain />,
}));
