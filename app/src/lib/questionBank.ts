// The standard intake questions for a product marketing search
// (docs/new-search-split.md, contract 3 and 4). They show at once in the
// Questions step, so it is never empty while the tailored set is being
// written. A shared core, then a group for the role type. Every question has
// source `bank`. The ids are stable: a saved, ticked or reordered list still
// lines up after the bank is edited, so add ids and never reuse one.

export type RoleType = 'ic_pmm' | 'senior_pmm' | 'technical_pmm' | 'head_of_pmm' | 'director_vp_pmm' | 'plg_pmm' | 'other'

export const ROLE_TYPES: { value: RoleType; label: string }[] = [
  { value: 'ic_pmm', label: 'Product marketing manager' },
  { value: 'senior_pmm', label: 'Senior or principal PMM' },
  { value: 'technical_pmm', label: 'Technical PMM' },
  { value: 'head_of_pmm', label: 'Head of product marketing' },
  { value: 'director_vp_pmm', label: 'Director or VP' },
  { value: 'plg_pmm', label: 'Product-led growth PMM' },
  { value: 'other', label: 'Something else' },
]

/** `bank` is the standard set, `jd` is tailored to the job description, `jd_gap` is something the JD leaves out or contradicts. */
export type QuestionSource = 'bank' | 'jd' | 'jd_gap'
export type BriefQuestion = {
  id: string
  text: string
  /** Why it is worth asking. The research run fills this for `jd` and `jd_gap`. */
  why?: string
  source: QuestionSource
  /** Added by the screen. */
  ticked?: boolean
  order?: number
}
export type QuestionGroup = { title: string; questions: BriefQuestion[] }
/** The `structured` of a questions note. */
export type QuestionSet = { role_type: RoleType; from_jd: boolean; groups: QuestionGroup[] }

type Draft = { title: string; prefix: string; questions: string[] }

const CORE: Draft[] = [
  {
    title: 'Why the role is open',
    prefix: 'why',
    questions: [
      'Why is this role open now: growth, a backfill or a replacement for someone who did not work out?',
      'If someone held it before, what did they do well, where did it fall short and where have they gone?',
      'What happens to the business if the seat is still empty in three months?',
    ],
  },
  {
    title: 'Scope and remit',
    prefix: 'scope',
    questions: [
      'Which products, product lines or customer segments will this person own?',
      'Which of these sit inside the remit: positioning and messaging, launches, pricing and packaging, competitive intelligence, sales enablement, analyst relations, customer marketing?',
      'What sits with product, demand generation or brand here that a candidate would expect product marketing to own?',
      'How much of the week is hands-on work and how much is leading or directing others?',
    ],
  },
  {
    title: 'Team and reporting line',
    prefix: 'team',
    questions: [
      'Who does the role report to, how long have they been in the seat and what is their own background?',
      'Who is in product marketing today, what does each person cover and how long has each been there?',
      'Are there direct reports on day one, and is there approved headcount to hire in the first year?',
    ],
  },
  {
    title: 'Product and go-to-market',
    prefix: 'gtm',
    questions: [
      'What do you sell, who buys it, who uses it and has the buyer changed in the last year?',
      'What does a typical deal look like: contract value, length of sales cycle and who signs?',
      'Is growth sales-led, product-led, partner-led or a mix, and which route brings in most new revenue?',
      'Who do you lose to most often, who do you beat and why in each case?',
    ],
  },
  {
    title: 'Launches and cadence',
    prefix: 'launch',
    questions: [
      'How often do you launch, and what counts as a top-tier launch here?',
      'Talk me through the last big launch: who ran it, what went well and what would you change?',
      'What is on the roadmap for the next two or three quarters that this person will take to market?',
    ],
  },
  {
    title: 'Working with sales and product',
    prefix: 'partners',
    questions: [
      'Is product marketing in the room before the roadmap is set, or handed features to launch once they are built?',
      'What does the sales team ask for most, and how would they rate what they get today?',
      'Where is the friction between teams, and who will be the hardest person for this hire to win over?',
    ],
  },
  {
    title: 'What success looks like',
    prefix: 'success',
    questions: [
      'What must be true after 90 days for you to say the hire is working?',
      'What will this person have delivered at six months, and at a year?',
      'Which numbers is the role judged on: pipeline, win rate, adoption, launch results or something else?',
    ],
  },
  {
    title: 'Must-haves and deal-breakers',
    prefix: 'must',
    questions: [
      'If you could screen on only three things, what would they be, and which requirements in the job description are really a wish list?',
      'What rules a candidate out, however strong the rest of the profile?',
      'Who have you met or turned down for this so far, and what was missing each time?',
      'Which companies would you love to hire from, and which backgrounds have not worked here?',
    ],
  },
  {
    title: 'Pay and level',
    prefix: 'pay',
    questions: [
      'What is the base salary range, and how much room is there at the top for the right person?',
      'What is the bonus as a percentage of base, what is it tied to and has it paid out in the last two years?',
      'What equity comes with it: type, grant value, vesting and whether there is a yearly refresh?',
      'What level is the role inside the company, would you go a level up or down for the right person and does pay change by location?',
    ],
  },
  {
    title: 'Location and work authorisation',
    prefix: 'place',
    questions: [
      'Where must this person be based, how many days in an office and how many hours of overlap with which time zone?',
      'Which US states can you employ in today, would you register in a new one for the right person and would you pay for a move?',
      'As company policy, will you sponsor a new work visa, and separately will you take over an existing one?',
    ],
  },
  {
    title: 'Process and timeline',
    prefix: 'process',
    questions: [
      'What are the interview stages, what does each one test and is there a task or presentation?',
      'Who interviews at each stage, who makes the final call and who can say no?',
      'When do you need this person to start, and can you commit to feedback within two working days of each interview?',
    ],
  },
  {
    title: 'Competition and exclusivity',
    prefix: 'field',
    questions: [
      'Are we working this alone, or are other agencies or your own recruiters on it too?',
      'How long has the role been open, where has it been advertised and who is already in process, including anyone internal?',
      'Which companies are off limits: customers, partners, anywhere with an agreement not to hire from or a past employer whose staff the hiring manager has agreed not to approach?',
    ],
  },
  {
    title: 'Selling points and risks',
    prefix: 'pitch',
    questions: [
      'Why would a strong product marketer leave a good job for this one?',
      'What will candidates worry about, such as runway, turnover or reviews online, and what is the honest answer?',
      'What can we tell candidates about funding, growth and customer numbers, and what must stay private?',
    ],
  },
]

const BY_ROLE: Record<RoleType, Draft> = {
  ic_pmm: {
    title: 'For a product marketing manager',
    prefix: 'ic',
    questions: [
      'Is this a second or third product marketing job, or could a strong mover from product, solutions engineering or customer success do it?',
      'Which part of the craft matters most on day one: messaging, launches, enablement or competitive work?',
      'Who will coach this person day to day, and how much time does that person really have?',
      'How much of the work is carrying out a plan someone else has set, and how much is their own to shape?',
      'How much does the writing matter, and would you like to see samples before a first interview?',
      'Where could this role lead in two years?',
    ],
  },
  senior_pmm: {
    title: 'For a senior or principal PMM',
    prefix: 'senior',
    questions: [
      'What makes this role senior: the size of the product, the freedom to decide or coaching others?',
      'Will they own a product line or segment end to end, and present to executives or the board?',
      'Must they have led a top-tier launch themselves, and at a company of what size?',
      'How does the week split between strategy, such as positioning, pricing and segmentation, and delivery?',
      'Which leaders at VP level will they work with without their manager in the room?',
      'Is there a path to principal or to managing people, and how soon could that happen?',
    ],
  },
  technical_pmm: {
    title: 'For a technical PMM',
    prefix: 'tech',
    questions: [
      'Who is the technical buyer or user: developers, data teams, security, IT or operations?',
      'Must they have worked as an engineer, solutions engineer or product manager, or is deep product fluency enough?',
      'Will they write or review technical content themselves: demos, documentation, reference architectures, benchmarks?',
      'Where is the line between this role and developer relations, solutions engineering and documentation?',
      'Is there an API, an open source project or a community, and what is product marketing’s part in it?',
      'Which technologies or ecosystems must they know on day one?',
    ],
  },
  head_of_pmm: {
    title: 'For a head of product marketing',
    prefix: 'head',
    questions: [
      'Is this the first product marketing leader here, or are they inheriting a function, and what state is it in?',
      'How big is the team today, how big should it be in a year and what budget will they hold?',
      'How hands-on must they be in the first year, and for how long?',
      'Which leadership tables do they sit at: marketing, product, the executive team?',
      'Which decisions are theirs outright: positioning, pricing and packaging, launch tiers, final say on messaging?',
      'Must they have built a team before, or would you back a strong senior or principal stepping up?',
      'What does the chief executive or founder think product marketing is for?',
    ],
  },
  director_vp_pmm: {
    title: 'For a director or VP',
    prefix: 'exec',
    questions: [
      'Is the title director or VP, is that open to discussion and what separates the two here?',
      'What does the organisation look like: how many people, how many layers and will they manage managers?',
      'How much contact with the board, investors and analysts, and is there a listing or a sale on the horizon?',
      'Which business outcome is this hire tied to: a move upmarket, a new product line, new regions or a new category?',
      'Which functions sit under them or could move under them: competitive intelligence, enablement, customer marketing, analyst relations?',
      'What revenue range and stage must they have worked through before?',
      'How settled is the leader they report to, and is this hire seen as a possible successor?',
    ],
  },
  plg_pmm: {
    title: 'For a product-led growth PMM',
    prefix: 'plg',
    questions: [
      'Is there a free trial or a free tier, and what are the activation and free-to-paid numbers today?',
      'Who owns in-product messaging, onboarding, lifecycle email and the pricing page: product marketing, growth or product?',
      'How will they work with the growth team, and will they run experiments themselves?',
      'Is there a sales-assisted or enterprise motion on top, and how are self-serve accounts handed to sales?',
      'Which numbers will they own: activation, conversion, expansion, retention?',
      'Must they have done this at a similar price point and for a similar user, such as developers, small firms or individuals?',
      'How comfortable with data must they be: product analytics tools, SQL, reading experiment results?',
    ],
  },
  other: {
    title: 'For this role',
    prefix: 'other',
    questions: [
      'How would you describe this role in one sentence to someone outside the company, and what would the market call it?',
      'Which nearby functions does it overlap with, such as product, growth, brand, enablement or customer marketing, and how does the week split between them?',
      'Whose background would be the closest match: can you name two or three people or companies?',
      'Is the title fixed, or could it change to fit what the market expects?',
    ],
  },
}

const toGroup = (d: Draft): QuestionGroup => ({
  title: d.title,
  questions: d.questions.map((text, i) => ({ id: `bank-${d.prefix}-${i + 1}`, text, source: 'bank' })),
})

export function isRoleType(value: unknown): value is RoleType {
  return typeof value === 'string' && value in BY_ROLE
}

/** The standard groups for a role type, at once. An unknown or missing role type gets the `other` set. The role's own group comes second, after why the role is open. */
export function questionBank(roleType: RoleType | null | undefined): QuestionGroup[] {
  const role = BY_ROLE[isRoleType(roleType) ? roleType : 'other']
  const [first, ...rest] = CORE.map(toGroup)
  return [first, toGroup(role), ...rest]
}

/** The same, as the `structured` of a questions note, ready for saveSearchNote. */
export function questionSet(roleType: RoleType | null | undefined): QuestionSet {
  return { role_type: isRoleType(roleType) ? roleType : 'other', from_jd: false, groups: questionBank(roleType) }
}

/** The questions as plain text, for Copy all and for the note's `content`. */
export function questionsAsText(groups: QuestionGroup[]): string {
  let n = 0
  return groups.map((g) => `${g.title}\n${g.questions.map((q) => `${++n}. ${q.text}`).join('\n')}`).join('\n\n')
}
