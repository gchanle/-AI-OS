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
            <circle cx="6.95" cy="6.9" r="3.15" fill="currentColor" />
            <circle cx="16.75" cy="7" r="3.15" fill="currentColor" />
            <circle cx="12.4" cy="12.05" r="2.7" fill="currentColor" />
            <circle cx="17.9" cy="17.2" r="2.3" fill="currentColor" />
        </svg>
    );
}
