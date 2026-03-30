'use client';

export default function FireflyMark({
    size = 20,
    className = '',
    title = '萤火虫标识',
    decorative = true,
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-hidden={decorative}
            role={decorative ? 'presentation' : 'img'}
        >
            {!decorative && <title>{title}</title>}
            <circle cx="6.95" cy="6.95" r="3.2" fill="currentColor" />
            <circle cx="17.05" cy="6.75" r="3.2" fill="currentColor" />
            <circle cx="12.2" cy="12.05" r="2.75" fill="currentColor" />
            <circle cx="7.6" cy="17.55" r="2.45" fill="currentColor" />
        </svg>
    );
}
