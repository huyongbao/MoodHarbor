export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
      </>
    ),
    chat: (
      <>
        <path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z" />
        <path d="M8 11h.01M12 11h.01M16 11h.01" />
      </>
    ),
    history: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="3" />
        <path d="M9 8h6M9 12h6M9 16h4M9 1v4M15 1v4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
      </>
    ),
    breath: (
      <>
        <path d="M8 3C5 6 3 8 3 12s4 5 7 3M14 3c4 4 7 7 7 11s-3 7-7 7M11 7c-5 6 6 5 0 12M15 8c-3 4 5 5 0 10" />
      </>
    ),
    story: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="3" />
        <path d="M8 5V3h8v2M8 10h8M8 14h5M8 18h4" />
      </>
    ),
    back: <path d="m15 5-7 7 7 7" />,
    arrow: <path d="m9 5 7 7-7 7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    shield: (
      <>
        <path d="m12 2 8 3v6c0 6-8 11-8 11S4 17 4 11V5Z" />
        <path d="m8 11 3 3 5-6" />
      </>
    ),
    send: (
      <>
        <path d="m3 3 18 9-18 9 3-9Z" />
        <path d="M6 12h15" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8" cy="8" r="1.5" />
        <path d="m3 17 5-5 4 4 4-6 5 7" />
      </>
    ),
    moon: <path d="M21 13a9 9 0 0 1-10-10A9 9 0 1 0 21 13Z" />,
    phone: (
      <path d="m5 3 4 4-2 3a15 15 0 0 0 7 7l3-2 4 4-2 3C10 23 1 14 2 5Z" />
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      </>
    ),
    check: <path d="m5 12 4 4L20 5" />,
    heart: (
      <path d="M20 4c-3-3-7-1-8 2-1-3-5-5-8-2s-2 7 1 10l7 7 7-7c3-3 4-7 1-10Z" />
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v.1" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8Z" />,
    refresh: (
      <>
        <path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.chat}
    </svg>
  )
}

export function BrandArt({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "brand-art small-art" : "brand-art"}
      viewBox="0 0 400 330"
      fill="none"
      role="img"
      aria-label="戴着蓝色安全头盔的树桩，停下来歇一歇"
    >
      <defs>
        <linearGradient
          id="wood"
          x1="150"
          y1="80"
          x2="285"
          y2="265"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#69788A" />
          <stop offset=".46" stopColor="#354F70" />
          <stop offset="1" stopColor="#162F51" />
        </linearGradient>
        <linearGradient
          id="helmet"
          x1="115"
          y1="175"
          x2="300"
          y2="285"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6DA8D9" />
          <stop offset=".35" stopColor="#366B9E" />
          <stop offset="1" stopColor="#1A4273" />
        </linearGradient>
        <linearGradient
          id="glass"
          x1="85"
          y1="175"
          x2="200"
          y2="290"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#C3E8FF" stopOpacity=".85" />
          <stop offset=".25" stopColor="#74B5DF" stopOpacity=".5" />
          <stop offset=".7" stopColor="#0C3158" stopOpacity=".6" />
          <stop offset="1" stopColor="#A2D2ED" stopOpacity=".85" />
        </linearGradient>
        <radialGradient id="halo">
          <stop stopColor="#9BD8FF" stopOpacity=".24" />
          <stop offset="1" stopColor="#9BD8FF" stopOpacity="0" />
        </radialGradient>
        <filter id="shadow">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      <circle cx="210" cy="175" r="146" fill="url(#halo)" />
      <ellipse
        cx="205"
        cy="286"
        rx="125"
        ry="13"
        fill="#0D3262"
        opacity=".3"
        filter="url(#shadow)"
      />
      <path
        d="M126 104c8 35 4 80-13 116l21 36c42 24 117 25 167-7-22-46-28-96-24-144Z"
        fill="url(#wood)"
        stroke="#142D4B"
        strokeWidth="4"
      />
      <path
        d="M139 119c6 18 3 40 2 57m14-47c2 12 7 24 4 39m98-41-5 42m20-46c-7 23-2 38 0 53m-37-43 1 23m-57-24 4 31m81 39 7 17m-147-27-6 23"
        stroke="#132D4E"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".65"
      />
      <ellipse
        cx="202"
        cy="106"
        rx="79"
        ry="27"
        fill="#FFF0CD"
        stroke="#182E48"
        strokeWidth="4"
      />
      <ellipse
        cx="203"
        cy="106"
        rx="66"
        ry="20"
        stroke="#CCA775"
        strokeWidth="2"
      />
      <ellipse
        cx="202"
        cy="106"
        rx="54"
        ry="15"
        stroke="#D4AA74"
        strokeWidth="2"
      />
      <ellipse
        cx="203"
        cy="106"
        rx="42"
        ry="11"
        stroke="#D9B581"
        strokeWidth="2"
      />
      <ellipse
        cx="203"
        cy="106"
        rx="29"
        ry="7"
        stroke="#C79A64"
        strokeWidth="2"
      />
      <ellipse cx="204" cy="106" rx="16" ry="3.5" fill="#E7C28C" />
      <path
        d="M120 167c-17 5-27 20-32 52-6 37 3 61 29 69 40 13 73 1 101-17 10-7 19-9 29-7l29 6c10 1 19-7 20-14l-9-13c-12-30-13-55-13-69-21 20-39 26-62 22-33-6-60-13-92-29Z"
        fill="url(#helmet)"
        stroke="#152E50"
        strokeWidth="4"
      />
      <path
        d="M121 168c-14 2-22 10-27 23 33 7 49 16 78 19 24 3 39 0 51-6"
        stroke="#C0E0F2"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M99 183c-13 26-18 68-6 88 8 15 34 22 60 18 23-3 46-23 58-42 8-14 12-26 7-34-10-18-35-9-61-17Z"
        fill="url(#glass)"
        stroke="#D4EBF8"
        strokeWidth="2.5"
      />
      <path
        d="M108 190c-10 18-15 47-12 62 3 8 6 9 9 8 0-26 8-45 13-65Z"
        fill="#E8F6FF"
        opacity=".4"
      />
      <path
        d="M98 277c19-14 38-17 47-31"
        stroke="#C9EBFB"
        strokeWidth="1.5"
        opacity=".7"
      />
      <circle
        cx="229"
        cy="216"
        r="17"
        fill="#213D64"
        stroke="#97C6E5"
        strokeWidth="2"
      />
      <circle
        cx="229"
        cy="216"
        r="12"
        fill="#3A75AA"
        stroke="#162E4D"
        strokeWidth="2"
      />
      <path d="m237 271 13-7 14 3-7 5Z" fill="#0A274A" />
      <circle cx="278" cy="253" r="3" fill="#8ABADD" />
      <path
        d="m298 157 8-5m-5 8 12-1M88 119l-7-4-5 5M318 212c13-2 13 10 24 7"
        stroke="#96CBF4"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".4"
      />
    </svg>
  )
}

export function Avatar({
  id = "zhou",
  portrait = false,
}: {
  id?: string
  portrait?: boolean
}) {
  const person = id === "lan" || id === "lin" ? "lan" : "zhou"
  return (
    <span
      className={`avatar person-${person}${
        portrait ? " partner-portrait" : ""
      }`}
      aria-hidden="true"
    >
      <img src={`/images/partner-${person}.png`} alt="" />
    </span>
  )
}
