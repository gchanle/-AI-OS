import {
    listFireflyTools,
    matchFireflyTools,
    resolveFireflyTool,
} from '@/services/fireflyToolRegistry';

function mapToolToSkill(tool = {}) {
    return {
        id: tool.id,
        name: tool.name,
        capabilityId: tool.capabilityId,
        description: tool.description,
    };
}

export function listFireflySkills() {
    return listFireflyTools().map(mapToolToSkill);
}

export function resolveFireflySkill(skillId) {
    const tool = resolveFireflyTool(skillId);
    return tool ? mapToolToSkill(tool) : null;
}

export function matchFireflySkills(options = {}) {
    return matchFireflyTools(options).map(mapToolToSkill);
}
