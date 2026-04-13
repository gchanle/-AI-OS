import crypto from 'crypto';
import { fetchChaoxingJson } from '@/lib/chaoxingAuth';

const DEFAULT_COURSE_API_BASE_URL = 'http://mooc1-api.chaoxing.com';
const DEFAULT_COURSE_ENDPOINT = '/mycourse/toquery_basisclient';
const DEFAULT_COURSE_APP_ID = '1000';

const ENC_STRATEGIES = [
    'md5_userid_type_key_upper',
    'md5_userid_type_key_with_tail_underscore_upper',
    'md5_uid_type_key_upper',
    'md5_uid_type_key_with_tail_underscore_upper',
    'md5_uid_secret',
    'md5_secret_uid',
    'md5_fid_uid_secret',
    'md5_uid_fid_secret',
    'md5_uid_timestamp_secret',
    'md5_fid_uid_timestamp_secret',
    'aes_json_zero_pad',
    'aes_json_md5_key',
    'raw_secret',
];

const successfulEncStrategyCache = new Map();

function trimValue(value) {
    return String(value || '').trim();
}

function safeJsonParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

function normalizeExtraQuery(value, fallback = {}) {
    if (!value) {
        return fallback;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }

    return safeJsonParse(String(value), fallback);
}

function normalizeRoleSignTypes(value, fallback = []) {
    if (Array.isArray(value)) {
        return value.map((item) => trimValue(item)).filter(Boolean);
    }

    const raw = trimValue(value);
    if (!raw) {
        return fallback;
    }

    if (raw.startsWith('[')) {
        const parsed = safeJsonParse(raw, []);
        if (Array.isArray(parsed)) {
            return parsed.map((item) => trimValue(item)).filter(Boolean);
        }
    }

    return raw
        .split(',')
        .map((item) => trimValue(item))
        .filter(Boolean);
}

function resolveCourseConfig(overrides = {}) {
    const baseUrl = trimValue(
        overrides.baseUrl
        || process.env.CHAOXING_COURSE_BASE_URL
        || DEFAULT_COURSE_API_BASE_URL
    );
    const endpoint = trimValue(
        overrides.endpoint
        || process.env.CHAOXING_COURSE_ENDPOINT
        || DEFAULT_COURSE_ENDPOINT
    );
    const uid = trimValue(
        overrides.uid
        || process.env.CHAOXING_COURSE_UID
        || process.env.CHAOXING_DEFAULT_UID
        || process.env.SERVICE_HALL_MCP_UID
    );
    const fid = trimValue(
        overrides.fid
        || process.env.CHAOXING_COURSE_FID
        || process.env.CHAOXING_FID
        || process.env.SERVICE_HALL_MCP_FID
    );
    const encSecret = trimValue(
        overrides.encSecret
        || process.env.CHAOXING_COURSE_ENC_SECRET
        || process.env.CHAOXING_COURSE_ENC_RULE
    );
    const encStrategy = trimValue(
        overrides.encStrategy
        || process.env.CHAOXING_COURSE_ENC_STRATEGY
    );
    const userIdParam = trimValue(
        overrides.userIdParam
        || process.env.CHAOXING_COURSE_USER_ID_PARAM
        || 'userid'
    );
    const appId = trimValue(
        overrides.appId
        || process.env.CHAOXING_COURSE_APP_ID
        || DEFAULT_COURSE_APP_ID
    );
    const firstThirdEnc = trimValue(
        overrides.firstThirdEnc
        || process.env.CHAOXING_COURSE_FIRST_THIRD_ENC
        || 'true'
    );
    const getCertifyType = trimValue(
        overrides.getCertifyType
        || process.env.CHAOXING_COURSE_GET_CERTIFY_TYPE
    );
    const learnedSignTypes = normalizeRoleSignTypes(
        overrides.learnedSignTypes
        || process.env.CHAOXING_COURSE_LEARNED_SIGN_TYPES,
        ['1']
    );
    const taughtSignTypes = normalizeRoleSignTypes(
        overrides.taughtSignTypes
        || process.env.CHAOXING_COURSE_TAUGHT_SIGN_TYPES,
        ['2']
    );
    const learnedQuery = normalizeExtraQuery(
        overrides.learnedQuery
        || process.env.CHAOXING_COURSE_LEARNED_QUERY,
        {}
    );
    const taughtQuery = normalizeExtraQuery(
        overrides.taughtQuery
        || process.env.CHAOXING_COURSE_TAUGHT_QUERY,
        {}
    );

    if (!uid || !fid) {
        throw new Error('课程接口缺少 uid 或 fid，请先在本地配置课程查询参数。');
    }

    if (!encSecret) {
        throw new Error('课程接口缺少 enc 规则，请先在本地配置 `CHAOXING_COURSE_ENC_SECRET`。');
    }

    return {
        baseUrl,
        endpoint,
        uid,
        fid,
        encSecret,
        encStrategy,
        userIdParam,
        appId,
        firstThirdEnc,
        getCertifyType,
        learnedSignTypes,
        taughtSignTypes,
        learnedQuery,
        taughtQuery,
    };
}

function md5(value = '') {
    return crypto.createHash('md5').update(String(value)).digest('hex');
}

function aes128EcbHex(payload, rawKey) {
    const keyBuffer = Buffer.alloc(16);
    Buffer.from(String(rawKey || ''), 'utf8').copy(keyBuffer, 0, 0, 16);
    const cipher = crypto.createCipheriv('aes-128-ecb', keyBuffer, null);
    cipher.setAutoPadding(true);
    return Buffer.concat([
        cipher.update(String(payload), 'utf8'),
        cipher.final(),
    ]).toString('hex');
}

function aes128EcbHexWithMd5Key(payload, rawKey) {
    const keyBuffer = Buffer.from(md5(rawKey).slice(0, 16), 'utf8');
    const cipher = crypto.createCipheriv('aes-128-ecb', keyBuffer, null);
    cipher.setAutoPadding(true);
    return Buffer.concat([
        cipher.update(String(payload), 'utf8'),
        cipher.final(),
    ]).toString('hex');
}

function buildEncCandidates({ uid, fid, appId, encSecret, signTypes = [], strategy }) {
    const timestamp = String(Date.now());
    const payload = JSON.stringify({
        fid,
        uid,
        time: timestamp,
        nonce: timestamp,
    });
    const enabledStrategies = strategy ? [strategy] : ENC_STRATEGIES;
    const normalizedSignTypes = signTypes.length ? signTypes : ['1'];
    const candidates = [];

    normalizedSignTypes.forEach((signType) => {
        enabledStrategies.forEach((id) => {
            if (id === 'md5_userid_type_key_upper') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${uid}_${signType}${encSecret}`).toUpperCase(), query: {} });
                return;
            }
            if (id === 'md5_userid_type_key_with_tail_underscore_upper') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${uid}_${signType}_${encSecret}`).toUpperCase(), query: {} });
                return;
            }
            if (id === 'md5_uid_type_key_upper') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${uid}${signType}${encSecret}`).toUpperCase(), query: {} });
                return;
            }
            if (id === 'md5_uid_type_key_with_tail_underscore_upper') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${uid}${signType}_${encSecret}`).toUpperCase(), query: {} });
                return;
            }
            if (id === 'md5_uid_secret') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${uid}${encSecret}`), query: {} });
                return;
            }
            if (id === 'md5_secret_uid') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${encSecret}${uid}`), query: {} });
                return;
            }
            if (id === 'md5_fid_uid_secret') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${fid}${uid}${encSecret}`), query: {} });
                return;
            }
            if (id === 'md5_uid_fid_secret') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${uid}${fid}${encSecret}`), query: {} });
                return;
            }
            if (id === 'md5_uid_timestamp_secret') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${uid}${timestamp}${encSecret}`), query: { ts: timestamp, _t: timestamp } });
                return;
            }
            if (id === 'md5_fid_uid_timestamp_secret') {
                candidates.push({ id: `${id}:${signType}`, enc: md5(`${fid}${uid}${timestamp}${encSecret}`), query: { ts: timestamp, _t: timestamp } });
                return;
            }
            if (id === 'aes_json_zero_pad') {
                candidates.push({ id: `${id}:${signType}`, enc: aes128EcbHex(payload, encSecret), query: {} });
                return;
            }
            if (id === 'aes_json_md5_key') {
                candidates.push({ id: `${id}:${signType}`, enc: aes128EcbHexWithMd5Key(payload, encSecret), query: {} });
                return;
            }

            candidates.push({ id: `${id}:${signType}`, enc: encSecret, query: {} });
        });
    });

    return candidates;
}

function buildCourseUrl(item = {}) {
    const href = trimValue(
        item.url
        || item.href
        || item.link
        || item.courseUrl
        || item.courseurl
        || item.openUrl
    );
    if (href) {
        return href;
    }

    const courseId = trimValue(item.courseid || item.courseId || item.coursedataid || item.id);
    const classId = trimValue(item.classid || item.classId || item.clazzid || item.clazzId);
    const cpi = trimValue(item.cpi || item.personId);
    if (!courseId) {
        return '';
    }

    const url = new URL('https://mooc1-1.chaoxing.com/mycourse/studentcourse');
    url.searchParams.set('courseid', courseId);
    if (classId) {
        url.searchParams.set('clazzid', classId);
    }
    if (cpi) {
        url.searchParams.set('cpi', cpi);
    }
    return url.toString();
}

function normalizeCover(value = '') {
    const raw = trimValue(value);
    if (!raw) {
        return '';
    }
    if (/^https?:\/\//i.test(raw)) {
        return raw;
    }
    if (raw.startsWith('//')) {
        return `https:${raw}`;
    }
    return raw;
}

function normalizeTeacher(item = {}) {
    const direct = trimValue(
        item.teacherName
        || item.teacher
        || item.teaName
        || item.teaname
        || item.tname
        || item.username
        || item.name2
    );
    if (direct) {
        return direct;
    }

    const teacherList = Array.isArray(item.teachers) ? item.teachers : [];
    const names = teacherList
        .map((entry) => trimValue(entry?.name || entry?.teacherName || entry?.realname))
        .filter(Boolean);
    return names.join('、');
}

function normalizeCourseItem(item = {}, role = 'learned') {
    const title = trimValue(
        item.courseName
        || item.coursename
        || item.name
        || item.title
        || item.course?.name
    );
    const teacherName = normalizeTeacher(item);
    const summary = trimValue(
        item.introduction
        || item.description
        || item.desc
        || item.schoolName
        || item.departmentName
    );
    const coverUrl = normalizeCover(
        item.imageurl
        || item.imageUrl
        || item.cover
        || item.coverUrl
        || item.pic
        || item.photoUrl
        || item.logo
    );
    const href = buildCourseUrl(item);

    return {
        id: trimValue(item.id || item.courseid || item.courseId || item.classid || item.clazzid || title),
        title: title || '未命名课程',
        teacherName: teacherName || (role === 'taught' ? '当前教师账号' : '暂无教师信息'),
        summary,
        coverUrl,
        href,
        role,
        raw: item,
    };
}

function collectNamedLists(source = {}, currentPath = '') {
    const entries = [];
    if (!source || typeof source !== 'object') {
        return entries;
    }

    Object.entries(source).forEach(([key, value]) => {
        const path = currentPath ? `${currentPath}.${key}` : key;
        if (Array.isArray(value)) {
            entries.push({ key, path, value });
            return;
        }

        if (value && typeof value === 'object') {
            entries.push(...collectNamedLists(value, path));
        }
    });

    return entries;
}

function isCourseLike(item = {}) {
    if (!item || typeof item !== 'object') {
        return false;
    }

    return Boolean(
        item.courseName
        || item.coursename
        || item.courseid
        || item.courseId
        || item.classid
        || item.clazzid
        || item.imageurl
        || item.cover
        || item.teacherName
    );
}

function pickCourseArray(payload = {}, role = 'learned') {
    const listEntries = collectNamedLists(payload);
    const preferredPatterns = role === 'taught'
        ? [/teach/i, /teacher/i, /myteach/i, /taught/i]
        : [/learn/i, /study/i, /student/i, /mylearn/i, /joined/i];

    const exactMatch = listEntries.find((entry) => (
        preferredPatterns.some((pattern) => pattern.test(entry.path))
        && entry.value.some(isCourseLike)
    ));
    if (exactMatch) {
        return exactMatch.value;
    }

    const genericMatch = listEntries.find((entry) => entry.value.some(isCourseLike));
    return genericMatch ? genericMatch.value : [];
}

async function fetchCoursePayload({ extraQuery = {}, config, role = 'learned' }) {
    const roleSignTypes = role === 'taught' ? config.taughtSignTypes : config.learnedSignTypes;
    const cacheKey = `${config.uid}:${config.fid}:${config.encSecret}:${role}:${roleSignTypes.join('|')}`;
    const candidatePool = successfulEncStrategyCache.has(cacheKey)
        ? [
            ...buildEncCandidates({
                uid: config.uid,
                fid: config.fid,
                appId: config.appId,
                encSecret: config.encSecret,
                signTypes: roleSignTypes,
                strategy: successfulEncStrategyCache.get(cacheKey),
            }),
            ...buildEncCandidates({
                uid: config.uid,
                fid: config.fid,
                appId: config.appId,
                encSecret: config.encSecret,
                signTypes: roleSignTypes,
                strategy: config.encStrategy,
            }).filter((item) => item.id !== successfulEncStrategyCache.get(cacheKey)),
        ]
        : buildEncCandidates({
            uid: config.uid,
            fid: config.fid,
            appId: config.appId,
            encSecret: config.encSecret,
            signTypes: roleSignTypes,
            strategy: config.encStrategy,
        });

    let lastFailureMessage = '';
    for (const candidate of candidatePool) {
        const url = new URL(config.endpoint, config.baseUrl);
        const query = {
            [config.userIdParam]: config.uid,
            fid: config.fid,
            appid: config.appId,
            firstthirdenc: config.firstThirdEnc,
            enc: candidate.enc,
            ...candidate.query,
            ...(config.getCertifyType ? { getCertifyType: config.getCertifyType } : {}),
            ...extraQuery,
        };

        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && String(value).trim()) {
                url.searchParams.set(key, String(value).trim());
            }
        });

        const response = await fetchChaoxingJson(url.toString());
        const payload = response.data || {};
        const errorMessage = trimValue(payload.errorMsg || payload.error || payload.msg);
        if (!response.ok) {
            lastFailureMessage = errorMessage || `课程接口请求失败（${response.status}）。`;
            continue;
        }

        if (payload.result === 0 && /enc验证失败/.test(errorMessage)) {
            lastFailureMessage = errorMessage;
            continue;
        }

        successfulEncStrategyCache.set(cacheKey, candidate.id);
        return {
            role,
            strategyId: candidate.id,
            payload,
        };
    }

    throw new Error(lastFailureMessage || '课程接口签名验证未通过，请检查 enc 规则或补充文档字段。');
}

function parseCourseCollection(payload = {}, role = 'learned') {
    const list = pickCourseArray(payload, role);
    return list.map((item) => normalizeCourseItem(item, role)).filter((item) => item.id || item.title);
}

export async function fetchCourseCollections(overrides = {}) {
    const config = resolveCourseConfig(overrides);
    const [learnedResponse, taughtResponse] = await Promise.all([
        fetchCoursePayload({
            config,
            role: 'learned',
            extraQuery: config.learnedQuery,
        }),
        fetchCoursePayload({
            config,
            role: 'taught',
            extraQuery: config.taughtQuery,
        }),
    ]);

    const learned = parseCourseCollection(learnedResponse.payload, 'learned');
    const taught = parseCourseCollection(taughtResponse.payload, 'taught');

    return {
        learned,
        taught,
        meta: {
            learnedStrategy: learnedResponse.strategyId,
            taughtStrategy: taughtResponse.strategyId,
            learnedSignTypes: config.learnedSignTypes,
            taughtSignTypes: config.taughtSignTypes,
            userIdParam: config.userIdParam,
        },
        raw: {
            learned: learnedResponse.payload,
            taught: taughtResponse.payload,
        },
    };
}
