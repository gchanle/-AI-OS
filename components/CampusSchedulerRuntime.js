'use client';

import { useEffect, useRef, useState } from 'react';
import { publishCampusNotification } from '@/data/campusPlatform';
import { upsertFireflyTask } from '@/data/fireflyTasks';
import {
    loadScheduledTasksState,
    markScheduledTaskFailure,
    markScheduledTaskSuccess,
    shouldRunScheduledTask,
    subscribeScheduledTasks,
} from '@/data/scheduledTasks';
import {
    ensureCampusUserProfile,
    subscribeCampusUserProfile,
} from '@/data/userProfile';
import { MORNING_DIGEST_TASK_ID } from '@/lib/scheduledTaskCatalog';

const CHECK_INTERVAL_MS = 60 * 1000;

export default function CampusSchedulerRuntime() {
    const runningRef = useRef(false);
    const [userProfile, setUserProfile] = useState(() => ensureCampusUserProfile());
    const [scheduledTasks, setScheduledTasks] = useState(() => loadScheduledTasksState());

    useEffect(() => subscribeCampusUserProfile(setUserProfile), []);
    useEffect(() => subscribeScheduledTasks(setScheduledTasks), []);

    useEffect(() => {
        let cancelled = false;

        const runDueTasks = async () => {
            if (runningRef.current || cancelled) {
                return;
            }

            const morningDigestTask = scheduledTasks[MORNING_DIGEST_TASK_ID];
            if (!shouldRunScheduledTask(morningDigestTask)) {
                return;
            }

            runningRef.current = true;

            try {
                const response = await fetch('/api/scheduled-tasks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        taskId: MORNING_DIGEST_TASK_ID,
                        uid: userProfile.uid,
                        fid: userProfile.fid,
                        lastSnapshotHash: morningDigestTask.lastSnapshotHash,
                        preferences: morningDigestTask,
                    }),
                });
                const payload = await response.json();

                if (!response.ok || !payload?.ok) {
                    throw new Error(payload?.error || 'Failed to execute scheduled task.');
                }

                const execution = payload.execution;
                if (execution?.runtime?.task) {
                    upsertFireflyTask({
                        ...execution.runtime.task,
                        uiContext: {
                            ...(execution.runtime.task.uiContext || {}),
                            surfaceLabel: '计划任务',
                            pageLabel: execution.label || '后台执行',
                            launcherLabel: '计划任务',
                            pathname: '/messages',
                            secondaryHref: execution?.notification?.href || '/messages',
                        },
                    });
                }
                if (execution?.notification) {
                    publishCampusNotification(execution.notification);
                }

                markScheduledTaskSuccess(MORNING_DIGEST_TASK_ID, {
                    lastEvaluatedAt: execution?.executedAt || new Date().toISOString(),
                    lastDeliveredAt: execution?.delivery?.shouldDeliver
                        ? (execution?.executedAt || new Date().toISOString())
                        : morningDigestTask.lastDeliveredAt,
                    lastSnapshotHash: execution?.result?.digest?.snapshotHash || morningDigestTask.lastSnapshotHash,
                });
            } catch (error) {
                console.error('Failed to run scheduled tasks:', error);
                markScheduledTaskFailure(MORNING_DIGEST_TASK_ID, {
                    lastEvaluatedAt: new Date().toISOString(),
                    lastError: error instanceof Error ? error.message : 'Failed to run scheduled task.',
                });
            } finally {
                runningRef.current = false;
            }
        };

        runDueTasks();
        const timer = window.setInterval(runDueTasks, CHECK_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [scheduledTasks, userProfile.fid, userProfile.uid]);

    return null;
}
