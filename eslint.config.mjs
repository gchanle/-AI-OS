import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
    {
        ignores: [
            '.next/**',
            'node_modules/**',
            'out/**',
            'build/**',
        ],
    },
    ...nextCoreWebVitals,
    {
        rules: {
            'react-hooks/immutability': 'off',
            'react-hooks/purity': 'off',
            'react-hooks/set-state-in-effect': 'off',
        },
    },
];

export default eslintConfig;
