import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';

// Run with: pnpm seed:faqs
// Add/edit entries below, then re-run — it's fine to re-run repeatedly during setup.
// Sourced from webbriks.com (the (home) route group in web-briks-client) as of Sep 2026.
const FAQS: Array<{ question: string; answer: string; category?: string }> = [
  // --- company ---
  {
    question: 'What is Web Briks? Who are you?',
    answer:
      'Web Briks is a global creative agency, founded in 2014 by Md. Ashaduzzaman. We build websites, web apps, and e-commerce solutions for brands worldwide, with offices in Dhaka, Albuquerque (USA), and Gaibandha.',
    category: 'company',
  },
  {
    question: 'How experienced is Web Briks? How many clients have you worked with?',
    answer: "We've been building since 2014 — over 12 years of experience, 200+ happy clients, and 50+ projects delivered across 9+ countries.",
    category: 'company',
  },
  {
    question: 'Where are your offices located?',
    answer:
      'We have three offices: Dhaka (Mirpur-10, Bangladesh — our main office), Albuquerque (USA), and Gaibandha (Bangladesh).',
    category: 'company',
  },
  {
    question: 'Can I see your portfolio or past work?',
    answer:
      "Sure — we've shipped projects like Trenzo, Corium Shoes, AyurLife, and Cutout Expert across e-commerce, SaaS, and corporate sites. Ask and we'll share links, or check the Portfolio page on our site.",
    category: 'company',
  },
  {
    question: 'How big is the Web Briks team?',
    answer: 'We have a team of 16+ specialists across design, full-stack development, and marketing, led by our founder Md. Ashaduzzaman.',
    category: 'company',
  },

  // --- services ---
  {
    question: 'What services does Web Briks offer?',
    answer:
      'Three core services: Web Design & Development, Software Development (custom apps, SaaS, ERP/CRM), and End-to-End E-commerce (store build + photography + ads + automation).',
    category: 'services',
  },
  {
    question: 'Do you build custom software or SaaS platforms?',
    answer:
      'Yes — custom software, SaaS platforms, ERP/CRM, POS & billing systems, hospital management, HR & payroll, inventory management, and multi-vendor e-commerce systems.',
    category: 'services',
  },
  {
    question: 'Do you help set up and grow e-commerce stores?',
    answer:
      'Yes, end-to-end: storefront + checkout build, product photography & retouching, ad creatives, Meta/Google Ads management, and order/inventory automation.',
    category: 'services',
  },
  {
    question: 'Do you offer product photography or photo editing?',
    answer:
      'Yes, through our Commerce Creative Studio (photography + retouching packages), and our sister brand CutoutExpert.com for dedicated photo editing.',
    category: 'services',
  },
  {
    question: 'Do you handle SEO and digital marketing / paid ads?',
    answer:
      'Yes — SEO packages (Foundation/Growth/Authority) and Paid Ads management (Meta, Google, TikTok), which can bundle together for a 10% discount.',
    category: 'services',
  },

  // --- pricing ---
  {
    question: 'How much does a business website cost?',
    answer:
      'Business website packages start at $999 one-time (Essential, 8 pages, 3-4 weeks) up to $1,499+ (Growth, 12-14 pages, 5-7 weeks). Exact pricing depends on pages and features needed.',
    category: 'pricing',
  },
  {
    question: 'How much does a web application or custom software cost?',
    answer:
      'Web app pricing starts at $3,500 (Pilot, MVP-scale, 6-8 weeks) up to $15,000+ (Nexus, SaaS/marketplace scale, 16-24 weeks) — priced by features/modules, not pages. We confirm exact scope on a call before quoting.',
    category: 'pricing',
  },
  {
    question: 'How much does an e-commerce store cost?',
    answer:
      'Starts at $1,499 one-time (Launch, up to 25 products) up to $5,999+ (Success, up to 300 products, multi-branch/POS support).',
    category: 'pricing',
  },
  {
    question: "My requirements don't fit a standard package — can I get a custom quote?",
    answer: "Yes — if your project doesn't fit a standard package, we put together a custom quote after a quick scoping call. No obligation to pay before that call.",
    category: 'pricing',
  },
  {
    question: 'Do you charge for ad spend on top of your management fee?',
    answer:
      'Ad spend is paid directly by you to the ad platform — we never hold your ad budget. Our management fee starts at $299/month depending on the plan.',
    category: 'pricing',
  },

  // --- delivery ---
  {
    question: 'How long does it take to build a website or app?',
    answer:
      'A standard business website typically takes 3-7 weeks depending on the package; more complex SaaS or e-commerce platforms can take 8-24 weeks from design to deployment.',
    category: 'delivery',
  },
  {
    question: 'When do I get the final files and access after the project is done?',
    answer: 'Final handover and credential transfer happen after full payment clearance, as per our delivery policy.',
    category: 'delivery',
  },
  {
    question: 'What if I need revisions during the project?',
    answer:
      'Reasonable revisions are included within the agreed scope — each package includes a set number of revision rounds (usually 2-3). Larger structural changes after approval may need an added scope agreement.',
    category: 'delivery',
  },

  // --- hosting ---
  {
    question: 'Do you provide hosting for the website/app you build?',
    answer:
      'Yes — managed hosting, server setup, cloud deployment, VPS management, Nginx/SSL configuration, and automated backups. Hosting is billed on a yearly renewal basis.',
    category: 'hosting',
  },
  {
    question: 'Do you guarantee 100% uptime for hosting?',
    answer:
      "We maintain strong server-level monitoring and target high uptime, but we can't guarantee 100% uninterrupted uptime — outages from third-party cloud providers aren't in our control.",
    category: 'hosting',
  },

  // --- maintenance ---
  {
    question: 'Do you offer ongoing maintenance after launch?',
    answer:
      'Yes — maintenance plans cover bug fixes, uptime monitoring, minor updates, and security checks during business hours, with priority attention for critical failures.',
    category: 'maintenance',
  },
  {
    question: 'Is a full redesign or new feature included in a maintenance plan?',
    answer: "No — major redesigns or new features fall outside standard maintenance and need a separate scope and quote.",
    category: 'maintenance',
  },

  // --- sla ---
  {
    question: "What's your uptime guarantee / SLA?",
    answer: 'We target 99.9% uptime as a best-effort service level, with critical issues prioritized during operational hours.',
    category: 'sla',
  },

  // --- contact ---
  {
    question: 'How can I contact Web Briks or get a quote?',
    answer: 'Email info@webbriks.com, call +8801977-201923, or fill the contact form on our website — we reply within 24 hours.',
    category: 'contact',
  },
  {
    question: 'Can I book a call with your team?',
    answer: "Yes — you can book directly via the Calendly link on our website, or just tell me a good time here and I'll help set it up.",
    category: 'contact',
  },
  {
    question: 'Will you sign an NDA before I share my project idea?',
    answer: "Yes, we're happy to sign an NDA on request — confidentiality is standard for all client work.",
    category: 'contact',
  },

  // --- careers ---
  {
    question: 'Are you hiring? How do I apply for a job at Web Briks?',
    answer:
      'Check the Careers page on our website for current open roles. Usually you send your CV, portfolio, and a short note to info@webbriks.com with the subject "Application for [Role]".',
    category: 'careers',
  },
  {
    question: 'Do you offer remote job positions?',
    answer:
      'A few roles (like video editing) are remote/contractual; most core roles are on-site at our Dhaka (Mirpur-10) office.',
    category: 'careers',
  },

  // --- policies ---
  {
    question: "What's your refund or cancellation policy?",
    answer:
      "We don't publish a fixed refund percentage — payment terms and any cancellation are agreed per contract, and project ownership only transfers to you after full payment. For your specific case, our team will confirm the details.",
    category: 'policies',
  },
  {
    question: 'Who owns the code and source files after the project is finished?',
    answer: 'Full ownership transfers to you once payment is complete; until then, Web Briks retains ownership of the source files and code.',
    category: 'policies',
  },
  {
    question: 'Is my project information kept confidential?',
    answer: "Yes — we treat all client info, source code, and business data as confidential under our NDA and privacy policy, even after the project ends.",
    category: 'policies',
  },

  // --- ticket tracking ---
  {
    question: 'How do I check the status of my support ticket?',
    answer:
      'Visit the Track Ticket page on our website, verify with your email (we send a 6-digit code), and you can see all your tickets, replies, and status live.',
    category: 'ticket',
  },
  {
    question: 'Can I attach a file when replying to a support ticket?',
    answer: 'Yes — up to 10MB per file, directly from the Track Ticket page.',
    category: 'ticket',
  },
];

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const knowledgeBase = app.get(KnowledgeBaseService);

  for (const faq of FAQS) {
    await knowledgeBase.upsertFaq(faq.question, faq.answer, faq.category);
    console.log(`Seeded: ${faq.question}`);
  }

  await app.close();
}

await run();
