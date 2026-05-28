export type NavLink = {
  label: string;
  href: string;
  description?: string;
  external?: boolean;
};

export type NavGroup = {
  label: string;
  links: NavLink[];
};

export type NavConfig = {
  primary: NavLink[];
  groups: NavGroup[];
};

export const NAV_CONFIG: NavConfig = {
  primary: [
    {
      label: "Home",
      href: "/",
    },
    {
      label: "Plan a Trip",
      href: "/itinerary/new",
    },
    {
      label: "Suppliers",
      href: "/suppliers",
    },
    {
      label: "Disclosures",
      href: "/disclosures",
    },
    {
      label: "Concierge",
      href: "/concierge",
    },
    {
      label: "Agent Dashboard",
      href: "/agent/dashboard",
    },
    {
      label: "Bookings",
      href: "/agent/bookings",
    },
    {
      label: "Compliance",
      href: "/compliance",
    },
  ],
  groups: [
    {
      label: "Travel Operations",
      links: [
        {
          label: "Plan a Trip",
          href: "/itinerary/new",
        },
        {
          label: "Suppliers",
          href: "/suppliers",
        },
        {
          label: "Disclosures",
          href: "/disclosures",
        },
        {
          label: "Compliance",
          href: "/compliance",
        },
      ],
    },
    {
      label: "Concierge",
      links: [
        {
          label: "Concierge",
          href: "/concierge",
        },
      ],
    },
    {
      label: "Agent Tools",
      links: [
        {
          label: "Agent Dashboard",
          href: "/agent/dashboard",
        },
        {
          label: "Bookings",
          href: "/agent/bookings",
        },
      ],
    },
  ],
};
