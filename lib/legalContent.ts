/**
 * Legal copy for /terms and /privacy (user 2026-07-17), rendered by
 * components/LegalPage.tsx. Data, not markup: `label` is a bolded run-in
 * (e.g. "Volatility."), `items` renders a list beneath the block's text.
 *
 * Both documents define "the Network" at their first mention and use the
 * short form after: the chain is deliberately unnamed ahead of launch.
 */

/** One run of prose: optional bolded run-in label, body text, optional list. */
export interface LegalBlock {
  label?: string;
  text: string;
  items?: string[];
}

export interface LegalSubsection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
  subsections?: LegalSubsection[];
}

export interface LegalDoc {
  /** H1 word (PageHeader appends the accent period). */
  title: string;
  /** Formal document name, shown in the subtitle. */
  formalTitle: string;
  updated: string;
  intro: LegalBlock[];
  sections: LegalSection[];
}

export const LEGAL_UPDATED = "19 July 2026";

export const TERMS: LegalDoc = {
  title: "Terms",
  formalTitle: "Terms of Service",
  updated: LEGAL_UPDATED,
  intro: [
    {
      text: "These Terms of Service (the \"Terms\") are a binding agreement between you and NU11 LABS LLC (\"NU11 LABS\", \"we\", \"us\" or \"our\"). They govern your access to and use of the PEA website and interface (the \"Site\" or the \"Services\").",
    },
    {
      text: "By accessing the Site, connecting a wallet, or using any feature of the Services, you confirm that you have read these Terms, that you understand them, and that you agree to be bound by them. If you do not agree, do not use the Services.",
    },
    {
      text: "Please read Section 9 (Limitation of Liability) and Section 13 (Dispute Resolution) carefully. They limit our liability to you and require most disputes to be resolved by binding individual arbitration rather than in court.",
    },
  ],
  sections: [
    {
      heading: "Description of the Services",
      blocks: [
        {
          text: "PEA is a decentralised mining protocol deployed on an Ethereum Layer-2 network (the \"Network\"). The Site is a non-custodial front-end: a graphical interface that helps you read publicly available on-chain information and prepare transactions that you sign and submit yourself.",
        },
        {
          text: "We do not custody your funds. We do not hold, generate or have access to your private keys or seed phrase. We do not operate the protocol's on-chain logic, and we cannot pause, reverse, alter or recover any transaction once it has been submitted to the network. The protocol's smart contracts run autonomously. Removing or disabling the Site would not stop them.",
        },
        {
          text: "The core mechanic works as follows. The interface presents a board of 25 tiles. Rounds run on a timer of approximately 60 seconds, followed by a brief settling phase. During a round, miners deploy ETH onto one or more tiles. At settlement, one tile is drawn, weighted by the amount of ETH sitting on it, so a tile carrying more ETH is more likely to be drawn. Miners who covered the winning tile share that round's ETH pot pro-rata to the amount they deployed. Miners whose ETH sat on losing tiles lose that ETH to the pot.",
        },
        {
          text: "A flat protocol fee of 10% is taken on each round's deployed ETH. 100% of that fee is used to buy back PEA on the open market. Of the PEA bought back, 95% is burned and 5% is distributed to PEA stakers.",
        },
        {
          text: "Each round mints 1.1 PEA. 1.0 PEA goes to the winning tile: there is a 50/50 chance that it is split across all miners on that tile or that it is awarded to a single miner, in each case pro-rata to what was deployed. The remaining 0.1 PEA grows the PEAPOT, a jackpot which has 1-in-633 odds of dropping to the winning tile in any given round.",
        },
        {
          text: "Holders may deposit PEA into staking to earn a share of the 5% of buybacks described above. Mining rewards accrue to your wallet as unharvested PEA and ETH; harvesting them (checkpointing and claiming through the interface) settles them on-chain into your wallet, with PEA paying out net of a 10% harvest fee. PEA has a fixed maximum supply of 3,000,000 tokens.",
        },
        {
          text: "We may add, change, suspend or remove features of the Site at any time, with or without notice. Nothing in these Terms obliges us to keep the Site online, to maintain any particular feature, or to continue offering the Services at all.",
        },
      ],
    },
    {
      heading: "Eligibility",
      blocks: [
        {
          text: "You may use the Services only if you are at least 18 years old and have reached the age of majority and full legal capacity in your jurisdiction. If you are using the Services on behalf of an entity, you represent that you are authorised to bind that entity to these Terms, and \"you\" refers to both you and that entity.",
        },
        {
          text: "You represent and warrant that you are not located in, ordinarily resident in, or organised under the laws of any jurisdiction where your use of the Services would be unlawful, and that you are not subject to any sanctions administered or enforced by any competent authority, and are not listed on any sanctions or restricted party list.",
        },
        {
          text: "You further represent that your use of the Services complies with all laws and regulations that apply to you. Access to the Site is offered on a neutral, general basis. It is not an offer or solicitation directed at any person in any jurisdiction where such an offer or solicitation would be prohibited.",
        },
        {
          text: "We may restrict or block access to the Services from any jurisdiction, address or region at our discretion, including where we believe access would create legal or regulatory risk.",
        },
      ],
    },
    {
      heading: "Wallet Connection and User Profiles",
      blocks: [
        {
          text: "To use the interactive features of the Services, you connect a non-custodial wallet through Privy, a third-party wallet-connection provider. Privy also supports email-based embedded wallets. Your use of Privy is governed by Privy's own terms and privacy policy, and we are not responsible for Privy's services.",
        },
        {
          text: "Connecting a wallet does not create an account with us in the traditional sense. It does not transfer custody of anything to us. You remain in sole control of your wallet, your keys and your transactions at all times. We never ask for and never want your seed phrase or private key. Any person who asks you for those on our behalf is attempting to defraud you.",
        },
        {
          text: "You may optionally create a public profile associated with your wallet address, including a display name and an avatar. Any profile information you choose to add may be visible to other users and to the public, and should be treated as public. Do not put anything in a profile that you would not publish openly.",
        },
        {
          text: "Usernames and avatars must be your own or properly licensed, and must not: impersonate any person, entity or brand; infringe anyone's intellectual property or other rights; contain unlawful, hateful, harassing, obscene or sexually explicit material; suggest an affiliation with or endorsement by us that does not exist; or attempt to mislead other users as to who you are. We may rename, remove, reclaim or refuse any username or avatar at any time, at our discretion and without notice.",
        },
        {
          text: "YOU ACKNOWLEDGE THAT WE ACT ONLY AS A PROVIDER OF AN INTERFACE. WE ARE NOT YOUR BROKER, DEALER, EXCHANGE, INTERMEDIARY, AGENT, ADVISER, TRUSTEE OR FIDUCIARY. NO FIDUCIARY DUTY, ADVISORY RELATIONSHIP OR SPECIAL RELATIONSHIP OF TRUST IS CREATED BETWEEN YOU AND US BY THESE TERMS, BY YOUR USE OF THE SERVICES, OR BY ANY COMMUNICATION WE MAY HAVE WITH YOU.",
        },
      ],
    },
    {
      heading: "User Responsibilities and Conduct",
      blocks: [
        {
          text: "You are solely responsible for your own conduct on the Services and for all activity that takes place through your wallet.",
        },
      ],
      subsections: [
        {
          heading: "Wallet and Security",
          blocks: [
            {
              text: "You are solely responsible for the security of your wallet, your private keys, your seed phrase, your device and your credentials. If you lose access to your wallet, or if your keys are lost, stolen or compromised, we cannot help you recover them and we cannot restore, reissue or reverse any assets. Those assets are likely gone permanently.",
            },
            {
              text: "You are responsible for verifying every transaction before you sign it, including the destination address, the amount and the network. Transactions on the network are irreversible. We are not responsible for losses caused by user error, mistyped or incorrect addresses, transactions sent on the wrong network, phishing sites impersonating PEA, malicious browser extensions, compromised devices, or your approval of a transaction you did not understand.",
            },
            {
              text: "Always confirm that you are on our official domain. We publish our official links through our official X account, @minepea_. Treat any other domain, contract address or link as untrusted until you have verified it against those official sources.",
            },
          ],
        },
        {
          heading: "Compliance with Laws",
          blocks: [
            {
              text: "You are responsible for knowing and complying with the laws and regulations that apply to you, including those relating to digital assets, gaming, gambling, prize competitions, consumer protection, sanctions, anti-money laundering and counter-terrorist financing.",
            },
            {
              text: "In some jurisdictions, activities that involve deploying value on an uncertain outcome may be regulated or prohibited. You must determine for yourself whether your use of the Services is lawful where you are. If it is not, you must not use the Services. We do not provide legal advice and we make no representation that the Services are lawful or appropriate in any particular jurisdiction.",
            },
            {
              text: "You must not use the Services with funds derived from unlawful activity, or to launder funds, evade sanctions, finance terrorism, or conceal the origin or ownership of any assets.",
            },
          ],
        },
        {
          heading: "Taxes",
          blocks: [
            {
              text: "You are solely responsible for determining what taxes apply to your activity, including any income, capital gains, gaming, value added or other taxes arising from deploying ETH, receiving ETH or PEA rewards, staking, harvesting, burning, transferring or disposing of tokens.",
            },
            {
              text: "We do not withhold taxes on your behalf, we do not report on your behalf, and we do not provide tax advice or tax documentation. We do not calculate your cost basis, and any figures displayed in the interface are for convenience only and are not a tax record. You should keep your own records and consult a qualified tax adviser in your jurisdiction.",
            },
          ],
        },
        {
          heading: "Prohibited Activities",
          blocks: [
            {
              text: "You must not, and must not attempt to, do any of the following:",
              items: [
                "Use the Services in violation of any applicable law, regulation or sanctions regime, or on behalf of any person barred from using them.",
                "Interfere with, disrupt, overload, or impair the Site or its supporting infrastructure, including by denial of service attacks, excessive automated requests, or abusive scraping.",
                "Probe, scan, or test the vulnerability of the Site or any related system, or breach or circumvent any security, authentication or access control measure, other than under a security disclosure process we have expressly published.",
                "Introduce malware, malicious code, or any mechanism designed to harm, surveil or gain unauthorised access to the Site, the protocol or other users.",
                "Reverse engineer, decompile or disassemble any part of the Site except to the extent that this restriction is prohibited by applicable law.",
                "Use bots, scripts, automation or any other means to gain an unfair or unintended advantage in rounds, to manipulate round outcomes, or to exploit a bug, error or unintended behaviour in the Site or the protocol rather than reporting it.",
                "Manipulate or attempt to manipulate the market for PEA, including through wash trading, spoofing, or coordinated deceptive activity, or use the Services to defraud or deceive other users.",
                "Impersonate any person or entity, or misrepresent your affiliation with any person or entity, including us.",
                "Frame, mirror, clone or misrepresent the Site, or present a copy of the interface as an official PEA property.",
                "Access the Services through a VPN, proxy or other method intended to disguise your location in order to evade a geographic restriction we have applied.",
                "Remove, obscure or alter any proprietary notice, mark or attribution on the Site.",
              ],
            },
            {
              text: "We may investigate suspected violations and may restrict or terminate your access to the Site in response, without notice and without liability to you.",
            },
          ],
        },
      ],
    },
    {
      heading: "Risks and Disclaimers",
      blocks: [
        {
          text: "Using the Services involves serious risk, including the risk that you lose everything you deploy. Do not deploy more than you can afford to lose entirely. By using the Services, you accept the following risks and acknowledge that they are inherent to how the protocol works.",
        },
        {
          label: "Volatility",
          text: "The price of ETH, of PEA and of any digital asset can move sharply and without warning, and can go to zero. PEA has no guaranteed price, no guaranteed liquidity and no guaranteed market. There may be no market for PEA at all, or a market may cease to exist.",
        },
        {
          text: "Total loss of deployed ETH is an expected outcome. This is how the game works. If the tile or tiles you covered are not drawn at settlement, you lose the ETH you deployed on them to that round's pot. Losing is the normal, intended and most likely result of any single round for most participants. It is not a bug, a malfunction or a basis for a refund or a claim.",
        },
        {
          label: "Odds",
          text: "One tile out of 25 is drawn each round, weighted by ETH deployed on each tile. Nothing about a past round predicts a future round. The PEAPOT has 1-in-633 odds of dropping in any given round and may not drop for a long time. Long losing streaks are statistically ordinary.",
        },
        {
          label: "Irreversibility",
          text: "Transactions on the network are final. Once a transaction is confirmed, it cannot be reversed, cancelled, refunded or recovered by us, by you, or by anyone else. We cannot recover ETH deployed on a losing tile, ETH sent to a wrong address, or assets lost through a compromised wallet.",
        },
        {
          label: "Smart contract and technical risk",
          text: "The protocol runs on smart contracts. Smart contracts may contain bugs, errors, vulnerabilities or economic flaws, including flaws that survive auditing. Exploits can result in partial or total loss of funds. The Network may experience congestion, reorganisations, downtime, sequencer failures, bridge failures, forks or other faults outside our control. The Site itself may fail to load, display stale or inaccurate information, or become unavailable at any time, including at the moment a round settles.",
        },
        {
          label: "Regulatory change",
          text: "The legal treatment of digital assets and of activity like PEA's is unsettled and moving. Laws, regulations, enforcement priorities and court decisions may change, possibly suddenly and possibly with retroactive effect. Such changes could restrict, impair or end your ability to use the Services or the protocol, could affect the value or transferability of PEA, and could require us to change or discontinue the Site.",
        },
        {
          label: "No guarantee of rewards or profit",
          text: "We do not promise, guarantee or project any reward, yield, return, APR, emission, buyback volume, burn rate or profit. Any figures shown in the interface, including staking metrics, are estimates based on current or historical data and are not a promise of future results. Rewards depend on protocol activity that neither we nor you control. You may receive nothing.",
        },
        {
          text: "PEA is a utility token used within the protocol. It is not offered as, and is not intended to be, an investment, a security, a share, a debt instrument, a fund interest, a derivative, or a claim on NU11 LABS or on any other entity, on any revenue, or on any asset. Holding PEA gives you no ownership, no equity, no dividend, no repayment right, no voting right over NU11 LABS, and no legal claim against us.",
        },
        {
          text: "NO ADVICE. NOTHING ON THE SITE, IN OUR DOCUMENTATION, OR IN ANY COMMUNICATION FROM US OR ANY PERSON ASSOCIATED WITH US CONSTITUTES FINANCIAL, INVESTMENT, TRADING, LEGAL, ACCOUNTING OR TAX ADVICE, OR A RECOMMENDATION OR SOLICITATION TO ACQUIRE, HOLD OR DISPOSE OF ANY ASSET. WE ARE NOT A LICENSED BROKER, ADVISER OR FINANCIAL INSTITUTION. ALL INFORMATION IS PROVIDED FOR GENERAL INFORMATIONAL PURPOSES ONLY. YOU ARE SOLELY RESPONSIBLE FOR YOUR OWN DECISIONS AND SHOULD CONSULT YOUR OWN QUALIFIED ADVISERS.",
        },
      ],
    },
    {
      heading: "No Warranties",
      blocks: [
        {
          text: "THE SERVICES, THE SITE, ALL CONTENT, ALL DATA AND ALL RELATED MATERIALS ARE PROVIDED \"AS IS\" AND \"AS AVAILABLE\", WITH ALL FAULTS AND WITHOUT WARRANTY OF ANY KIND.",
        },
        {
          text: "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NU11 LABS LLC AND ITS MEMBERS, MANAGERS, OFFICERS, EMPLOYEES, CONTRACTORS, AGENTS, CONTRIBUTORS AND LICENSORS (TOGETHER, THE \"NU11 LABS PARTIES\") DISCLAIM ALL WARRANTIES, EXPRESS, IMPLIED, STATUTORY OR OTHERWISE, INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, QUIET ENJOYMENT, ACCURACY AND NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING, COURSE OF PERFORMANCE OR USAGE OF TRADE.",
        },
        {
          text: "WE DO NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, TIMELY, SECURE, ACCURATE, COMPLETE, CURRENT OR ERROR FREE; THAT DEFECTS WILL BE CORRECTED; THAT THE SITE OR ITS INFRASTRUCTURE IS FREE OF VIRUSES OR HARMFUL COMPONENTS; THAT ANY DATA DISPLAYED, INCLUDING BALANCES, ROUND STATE, PRICES, ODDS, HISTORY OR REWARD ESTIMATES, IS ACCURATE OR CURRENT; OR THAT ANY TRANSACTION YOU SUBMIT WILL BE INCLUDED, CONFIRMED, ORDERED OR SETTLED AS YOU EXPECT.",
        },
        {
          text: "WE MAKE NO WARRANTY REGARDING THE SMART CONTRACTS OF THE PEA PROTOCOL, THE UNDERLYING NETWORK, ANY THIRD-PARTY SERVICE, OR THE SECURITY, VALUE, LIQUIDITY OR CONTINUED EXISTENCE OF PEA OR ANY OTHER ASSET.",
        },
        {
          text: "NO ADVICE OR INFORMATION, WHETHER ORAL OR WRITTEN, OBTAINED FROM US OR THROUGH THE SERVICES, CREATES ANY WARRANTY NOT EXPRESSLY STATED IN THESE TERMS.",
        },
        {
          text: "SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES. TO THAT EXTENT, SOME OF THE ABOVE EXCLUSIONS MAY NOT APPLY TO YOU, AND OUR WARRANTIES ARE LIMITED TO THE MINIMUM EXTENT PERMITTED BY LAW.",
        },
      ],
    },
    {
      heading: "Transactions and Fees",
      blocks: [
        {
          text: "All activity on the Services is denominated in ETH and PEA. We do not accept, process, hold, transmit or convert fiat currency, and we do not offer any payment, banking or money transmission service. Any fiat values shown, such as USD figures, are indicative estimates drawn from public price sources and are for display only.",
        },
        {
          label: "Protocol fee",
          text: "A flat fee of 10% is taken on each round's deployed ETH. 100% of that fee is used to buy back PEA on the open market. Of the PEA bought back, 95% is burned and 5% is distributed to PEA stakers. This fee and its allocation are set by the protocol and may change. Changes may be made without individual notice to you, and your continued use after a change constitutes your acceptance of it. The interface reflects the parameters in effect at the time you use it, and you are responsible for reviewing them before you deploy.",
        },
        {
          label: "Gas and network costs",
          text: "Every transaction you submit requires a network fee, commonly called gas, paid to the network and not to us. Gas is your responsibility. Gas costs are variable and can spike. We do not control, set, refund or reimburse gas, and gas is not refunded when a transaction fails, reverts, is dropped or is replaced.",
        },
        {
          label: "Finality",
          text: "ALL TRANSACTIONS ARE FINAL AND NON-REFUNDABLE. Once you sign and submit a transaction, it cannot be reversed, cancelled, amended or refunded by us. We do not offer refunds, credits, chargebacks, make-goods or compensation for any reason, including a lost round, a missed round, a mistimed deployment, a failed transaction, an interface error, a display error, downtime, network congestion, or a change in the price of any asset.",
        },
        {
          text: "Settlement is performed by the protocol on-chain. Round outcomes, pot distribution, emissions, PEAPOT drops and staking rewards are determined by the smart contracts, not by us. We cannot influence, override, replay, re-run or correct an outcome. Where the interface and the chain disagree, the chain governs.",
        },
        {
          text: "PEA is a utility token used within the protocol. It has no guaranteed value, no guaranteed market and no guaranteed liquidity, and its supply is capped at a fixed maximum of 3,000,000 tokens. We do not promise to support, list, buy, redeem or maintain a market for PEA, and we do not promise that PEA will retain any value.",
        },
        {
          text: "You are responsible for ensuring you have sufficient ETH for both the amount you intend to deploy and the gas required. We are not liable for a transaction that fails for insufficient funds, slippage, an expired approval, or a wallet configuration issue.",
        },
      ],
    },
    {
      heading: "Third-Party Services",
      blocks: [
        {
          text: "The Services depend on third parties. We do not control them, we do not endorse them beyond our use of them, and we are not responsible or liable for their acts, omissions, availability, security, pricing, policies or content.",
        },
        {
          label: "Privy",
          text: "Wallet connection, and optionally email-based embedded wallets, are provided by Privy. Your relationship with Privy is governed by Privy's own terms and privacy policy. If Privy suffers an outage, a defect or a security incident, your ability to connect or to use an embedded wallet may be affected, and we are not liable for that.",
        },
        {
          label: "Vercel",
          text: "The Site is hosted and served using infrastructure provided by Vercel. Vercel processes technical data such as connection information as part of delivering the Site. Vercel's own terms and policies apply to its services.",
        },
        {
          label: "Public RPC endpoints",
          text: "We read on-chain data, including your token balances, through a public RPC endpoint. RPC providers may return delayed, incomplete or incorrect data, may rate limit requests, or may become unavailable. Displayed balances and round state may lag the chain.",
        },
        {
          label: "Public price sources",
          text: "Price information, including ETH and PEA price displays, is read from public sources. Price data may be delayed, wrong, stale or unavailable. Do not rely on any price shown on the Site as authoritative, and never rely on it for a trading, tax or valuation decision.",
        },
        {
          text: "The Site may contain links to third-party websites, block explorers, documentation, markets or community resources. Those links are provided for convenience only. We do not control or endorse them, we do not vet their contents, and your use of them is at your own risk and subject to their own terms.",
        },
        {
          text: "We may add, replace or remove third-party providers at any time without notice.",
        },
      ],
    },
    {
      heading: "Limitation of Liability",
      blocks: [
        {
          text: "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL THE NU11 LABS PARTIES BE LIABLE TO YOU FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, BUSINESS, GOODWILL, OPPORTUNITY, DATA, TOKENS, DIGITAL ASSETS, OR ANTICIPATED SAVINGS, OR FOR ANY LOSS ARISING FROM THE CHANGE IN VALUE OF ANY DIGITAL ASSET, HOWEVER CAUSED AND UNDER ANY THEORY OF LIABILITY, INCLUDING CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, WARRANTY OR OTHERWISE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES AND EVEN IF A LIMITED REMEDY FAILS OF ITS ESSENTIAL PURPOSE.",
        },
        {
          text: "WITHOUT LIMITING THE FOREGOING, THE NU11 LABS PARTIES WILL HAVE NO LIABILITY WHATSOEVER FOR: ETH LOST ON A LOSING TILE OR OTHERWISE LOST, FORFEITED OR NOT WON IN ANY ROUND; ANY ROUND OUTCOME, SETTLEMENT, EMISSION, PEAPOT RESULT OR STAKING REWARD; ANY BUG, DEFECT, EXPLOIT, HACK OR ECONOMIC FLAW IN THE PEA SMART CONTRACTS; ANY FAILURE, CONGESTION, REORGANISATION, FORK, SEQUENCER FAULT OR DOWNTIME OF THE ETHEREUM LAYER-2 NETWORK ON WHICH THE PEA PROTOCOL IS DEPLOYED; ANY UNAVAILABILITY, ERROR, INACCURACY, LATENCY OR STALE DISPLAY IN THE SITE; ANY LOSS OF, THEFT OF, OR UNAUTHORISED ACCESS TO YOUR WALLET, KEYS, SEED PHRASE OR DEVICE; ANY ACT, OMISSION, OUTAGE OR SECURITY INCIDENT OF PRIVY, VERCEL, ANY RPC PROVIDER, ANY PRICE SOURCE OR ANY OTHER THIRD PARTY; ANY PHISHING SITE, FAKE TOKEN, IMPERSONATION OR FRAUD BY A THIRD PARTY; OR ANY REGULATORY, LEGAL OR TAX CONSEQUENCE OF YOUR ACTIVITY.",
        },
        {
          text: "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE TOTAL AGGREGATE LIABILITY OF THE NU11 LABS PARTIES TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICES, WHETHER IN CONTRACT, TORT OR OTHERWISE, WILL NOT EXCEED ONE HUNDRED UNITED STATES DOLLARS (USD 100) IN THE AGGREGATE. THIS CAP APPLIES ACROSS ALL CLAIMS COMBINED AND IS NOT PER CLAIM, PER ROUND OR PER INCIDENT.",
        },
        {
          text: "YOU ACKNOWLEDGE THAT THESE LIMITATIONS ARE A FUNDAMENTAL BASIS OF THE BARGAIN BETWEEN YOU AND US, THAT THE SERVICES ARE PROVIDED TO YOU WITHOUT CHARGE BY US, AND THAT WE WOULD NOT PROVIDE THE SERVICES WITHOUT THESE LIMITATIONS.",
        },
        {
          text: "SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES OR LIABILITIES. IN THOSE JURISDICTIONS, OUR LIABILITY IS LIMITED TO THE GREATEST EXTENT PERMITTED BY LAW. NOTHING IN THESE TERMS EXCLUDES LIABILITY THAT CANNOT LAWFULLY BE EXCLUDED, INCLUDING LIABILITY FOR FRAUD OR FRAUDULENT MISREPRESENTATION.",
        },
      ],
    },
    {
      heading: "Indemnification",
      blocks: [
        {
          text: "You agree to indemnify, defend and hold harmless the NU11 LABS Parties from and against any and all claims, demands, actions, proceedings, investigations, damages, losses, liabilities, judgments, settlements, fines, penalties, costs and expenses, including reasonable legal fees and expenses, arising out of or relating to:",
        },
        {
          text: "your access to or use of the Services; your deployment of ETH, your staking or other protocol activity; your violation of these Terms; your violation of any law, regulation or sanctions requirement; your violation of the rights of any third party, including intellectual property, privacy and publicity rights; any content you submit, including a username or avatar; any tax obligation of yours; and any misuse of your wallet, keys or device, whether or not authorised by you.",
        },
        {
          text: "We reserve the right, at your expense, to assume the exclusive defence and control of any matter otherwise subject to indemnification by you, in which case you agree to cooperate fully with our defence. You will not settle any matter that imposes any obligation or admission on any NU11 LABS Party without our prior written consent.",
        },
        {
          text: "This indemnity survives termination of these Terms and your use of the Services.",
        },
      ],
    },
    {
      heading: "Force Majeure",
      blocks: [
        {
          text: "We are not liable for any delay in performance, failure to perform, or unavailability of the Services caused by circumstances beyond our reasonable control.",
        },
        {
          text: "These include, without limitation: acts of God, natural disasters, fire, flood, epidemic or pandemic, war, terrorism, civil unrest, sabotage, labour disputes, government action, regulation, sanctions, court order or law enforcement demand, embargo, changes in law, power or internet failure, failures of telecommunications or hosting infrastructure, failures or outages of any third-party service including Privy, Vercel, RPC providers or price sources, network congestion, chain reorganisations, forks, sequencer or validator failures, cyberattacks, exploits, denial of service attacks, and any other event that could not reasonably have been foreseen or avoided.",
        },
        {
          text: "If a force majeure event continues, we may suspend or discontinue the Services without liability to you.",
        },
      ],
    },
    {
      heading: "Termination",
      blocks: [
        {
          text: "We may suspend, restrict, block or terminate your access to the Site at any time, for any reason or no reason, with or without notice and without liability to you. This includes blocking access from particular jurisdictions, addresses or regions.",
        },
        {
          text: "You may stop using the Services at any time. Simply disconnect your wallet and stop visiting the Site.",
        },
        {
          text: "Because the protocol is deployed on a public network and runs autonomously, terminating your access to the Site does not remove your ability to interact with the protocol directly, and does not affect any transaction already submitted or settled. We do not control that, and we make no representation about your ability to interact with the protocol through any other means.",
        },
        {
          text: "Termination does not entitle you to any refund, compensation or recovery of any kind. Sections that by their nature should survive termination will survive, including Description of the Services to the extent descriptive, Risks and Disclaimers, No Warranties, Transactions and Fees, Third-Party Services, Limitation of Liability, Indemnification, Dispute Resolution, and Entire Agreement.",
        },
      ],
    },
    {
      heading: "Dispute Resolution",
      blocks: [
        {
          text: "PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS, INCLUDING YOUR RIGHT TO FILE A LAWSUIT IN COURT AND TO HAVE A JURY TRIAL.",
        },
        {
          label: "Informal resolution first",
          text: "Before starting any formal proceeding, you agree to contact us through our official X account, @minepea_, and to describe the dispute and the relief you seek in reasonable detail. We will attempt in good faith to resolve the matter informally. Both parties agree to engage in this process for at least 60 days from the date of first notice before commencing arbitration. This step is a condition precedent to arbitration.",
        },
        {
          label: "Binding arbitration",
          text: "If the dispute is not resolved informally, you and we agree that any dispute, claim or controversy arising out of or relating to these Terms or the Services, including their formation, interpretation, breach, termination, validity or enforceability, will be resolved exclusively by final and binding individual arbitration, and not in a court of general jurisdiction.",
        },
        {
          text: "The arbitration will be administered by a recognised, neutral arbitration institution under its rules then in effect, before a single arbitrator. The arbitration will be conducted in the English language. The seat of arbitration will be the State of Delaware, United States, unless the parties agree otherwise in writing, and hearings may be conducted remotely by video or on documents alone where the arbitrator permits. The arbitrator has exclusive authority to resolve any dispute about the scope, applicability, enforceability or formation of this arbitration agreement, including any claim that all or part of it is void. The arbitrator's award is final and binding, and judgment on the award may be entered in any court of competent jurisdiction.",
        },
        {
          text: "CLASS ACTION WAIVER. YOU AND WE AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN AN INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, CONSOLIDATED, COORDINATED, PRIVATE ATTORNEY GENERAL OR REPRESENTATIVE PROCEEDING. THE ARBITRATOR MAY NOT CONSOLIDATE OR JOIN THE CLAIMS OF MORE THAN ONE PERSON, MAY NOT PRESIDE OVER ANY FORM OF A REPRESENTATIVE OR CLASS PROCEEDING, AND MAY AWARD RELIEF ONLY IN FAVOUR OF THE INDIVIDUAL PARTY SEEKING RELIEF AND ONLY TO THE EXTENT NECESSARY TO PROVIDE RELIEF ON THAT PARTY'S INDIVIDUAL CLAIM. YOU AND WE WAIVE ANY RIGHT TO A JURY TRIAL. If this class action waiver is found unenforceable as to a particular claim or request for relief, then this entire arbitration section is null and void as to that claim or request only, and it must be brought in a court of competent jurisdiction. The remainder of this section survives.",
        },
        {
          label: "Exceptions",
          text: "Either party may bring an individual action in small claims court if it qualifies, and either party may seek injunctive or other equitable relief in a court of competent jurisdiction to prevent actual or threatened infringement or misappropriation of intellectual property rights, or unauthorised access to or misuse of the Services.",
        },
        {
          label: "Time limit",
          text: "To the maximum extent permitted by applicable law, any claim arising out of or relating to these Terms or the Services must be commenced within one (1) year after the claim arises. Otherwise, the claim is permanently barred.",
        },
        {
          label: "Governing law",
          text: "These Terms and any dispute arising from them are governed by the laws of the State of Delaware, United States, without regard to its conflict of laws principles, except that the enforceability of this arbitration agreement is governed by the Federal Arbitration Act. Where mandatory consumer protection law in your country of residence gives you rights that cannot be waived by agreement, nothing in this section removes those rights.",
        },
      ],
    },
    {
      heading: "Changes to These Terms",
      blocks: [
        {
          text: "We may modify these Terms at any time. When we do, we will post the updated Terms on the Site and update the \"Last updated\" date at the top of the document. Where we consider a change material, we will make reasonable efforts to give additional notice, such as a post from our official X account or a notice in the interface.",
        },
        {
          text: "Changes take effect when posted, unless we state a later effective date. Your continued access to or use of the Services after the changes take effect constitutes your acceptance of the updated Terms. If you do not agree to a change, your sole remedy is to stop using the Services.",
        },
        {
          text: "We may also change the Services and their parameters, including protocol parameters and fee allocation, as described in these Terms. You are responsible for checking the Terms and the interface periodically. We do not undertake to notify you individually of any change.",
        },
        {
          text: "Any change to the arbitration provisions in Section 13 will not apply to a dispute of which we had actual notice before the change was posted.",
        },
      ],
    },
    {
      heading: "Privacy",
      blocks: [
        {
          text: "Our collection and use of information in connection with the Services is described in the PEA Privacy Policy, which is incorporated into these Terms by reference. Please read it. By using the Services, you agree to the practices described in it.",
        },
        {
          text: "In short, the Services are designed to minimise the personal information we handle. We do not require an account with us, and we do not collect a name, an address or a payment method. On-chain activity is inherently public: your wallet address, your deployments and your rewards are recorded on a public network, are visible to anyone, and cannot be deleted or made private by us or by you. Any profile information you add, such as a username or avatar, is public by design.",
        },
        {
          text: "Third parties involved in delivering the Services, including Privy, Vercel, RPC providers and price sources, process data under their own policies. Where the Privacy Policy and these Terms conflict on a privacy matter, the Privacy Policy governs.",
        },
      ],
    },
    {
      heading: "Entire Agreement",
      blocks: [
        {
          text: "These Terms, together with the Privacy Policy and any other policy or notice we expressly incorporate, constitute the entire agreement between you and NU11 LABS LLC regarding the Services. They supersede all prior or contemporaneous understandings, communications, representations, proposals and agreements, whether written or oral, regarding the Services. You confirm that you have not relied on any statement, representation or assurance that is not set out in these Terms.",
        },
        {
          label: "Severability",
          text: "If any provision of these Terms is held invalid, illegal or unenforceable, that provision will be modified to the minimum extent necessary to make it enforceable, or if it cannot be modified, it will be severed. The remaining provisions remain in full force and effect. This is subject to Section 13, which specifies its own treatment of the class action waiver.",
        },
        {
          label: "No waiver",
          text: "Our failure or delay in enforcing any provision is not a waiver of that provision or of any other. A waiver is effective only if given in writing by us, and applies only to the specific instance stated.",
        },
        {
          label: "Assignment",
          text: "You may not assign or transfer these Terms or any of your rights or obligations under them, by operation of law or otherwise, without our prior written consent. Any attempted assignment without consent is void. We may assign or transfer these Terms freely, in whole or in part, without restriction and without notice.",
        },
        {
          label: "No third-party beneficiaries",
          text: "Except for the NU11 LABS Parties, who may enforce the provisions of these Terms that benefit them, these Terms do not create any right or benefit for any third party.",
        },
        {
          label: "Relationship",
          text: "Nothing in these Terms creates any partnership, joint venture, agency, employment, fiduciary or trust relationship between you and us.",
        },
        {
          label: "Headings and interpretation",
          text: "Headings are for convenience only and do not affect interpretation. \"Including\" means \"including without limitation\". These Terms are drafted in English. If we provide a translation, the English version governs in the event of any conflict.",
        },
      ],
    },
    {
      heading: "Contact",
      blocks: [
        {
          text: "Questions, notices and disputes relating to these Terms should be directed to NU11 LABS LLC through our official X account, @minepea_, or through our official community channels, which we announce from that account.",
        },
        {
          text: "We publish our official links, domains and contract addresses through our official X account. Please verify any link, address or announcement against that account before you act on it. We will never ask you for your seed phrase or your private key, and we will never ask you to send funds to an address in order to receive a reward.",
        },
        {
          text: "We aim to respond to legitimate enquiries within a reasonable time, but we do not guarantee a response, a support outcome, or any particular response time.",
        },
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Privacy",
  formalTitle: "Privacy Policy",
  updated: LEGAL_UPDATED,
  intro: [
    {
      text: "This Privacy Policy explains how NU11 LABS LLC (\"NU11 LABS\", \"we\", \"us\", \"our\") handles information in connection with the PEA website and frontend interface (the \"Site\"). The Site is a non-custodial interface to the PEA mining protocol, a decentralised protocol deployed on an Ethereum Layer-2 network (the \"Network\"). We do not custody user funds, we do not hold private keys, and we do not control the protocol's on-chain operation.",
    },
    {
      text: "Because the Site is an interface rather than an account-based service, we collect very little about you. There is no sign-up, no password, and no user account with us. You interact with PEA by connecting a self-custodial wallet, and most of what happens when you mine or stake is recorded on a public blockchain that we neither own nor control. This policy describes the limited information that does pass through the Site, what we do with it, and the choices you have.",
    },
    {
      text: "By using the Site, you agree to this Privacy Policy. If you do not agree, please do not use the Site.",
    },
  ],
  sections: [
    {
      heading: "Information We Collect",
      blocks: [
        {
          text: "We collect the categories of information described below. We do not ask you for, and you should never send us, information beyond what is described here.",
        },
      ],
      subsections: [
        {
          heading: "Blockchain Data",
          blocks: [
            {
              text: "When you connect a wallet and use PEA, your activity is recorded on the Network. That network is public. Anyone can read it, including us.",
            },
            {
              text: "The on-chain information associated with your wallet address includes: the public address itself, the amount of ETH you deploy onto tiles, the tiles you cover in each round, the outcome of each round for you, PEA you win from the winning tile, PEA you receive from a PEAPOT drop, PEA you stake or unstake, rewards you harvest (checkpoint and claim), token balances, transaction hashes, and timestamps.",
            },
            {
              text: "We read this data from the network in order to display it back to you and to power the Site's live views and analytics. We do not create it and we cannot alter or delete it. A wallet address is pseudonymous, not anonymous: it does not contain your name, but all activity tied to it is permanently visible, and it may become linkable to you by third parties through means outside our control, for example through an exchange, a public post, or on-chain analysis.",
            },
          ],
        },
        {
          heading: "Profile Information",
          blocks: [
            {
              text: "The Site lets you optionally set a display username and an avatar image for your wallet. This is entirely optional. PEA works without it. When you save a profile, we store the username and avatar with our database provider so that other miners can see them next to your wallet's activity, and we keep a local copy in your browser.",
            },
            {
              text: "You may also optionally link a Discord account to your wallet. The linking is handled by Privy, and if you complete it we receive your Discord username and account id. We store that link with our database provider and show the username in your profile drawer, and we read your wallet's on-chain PEA holdings to assign holder roles in our community server, re-checked on a schedule. Linking is entirely optional, you can decline it, and PEA works without it. Unlinking from the profile panel removes the stored link and the roles. Your Discord password is never shared with us.",
            },
            {
              text: "Anything you put in a profile should be treated as public. Do not use your real name, your likeness, or any image or handle you are not comfortable having associated with your wallet address and its on-chain history. We do not verify, and do not want, any link between a profile and your real-world identity.",
            },
          ],
        },
        {
          heading: "Technical Data",
          blocks: [
            {
              text: "Like nearly all websites, the Site and its hosting infrastructure automatically receive certain technical information when you load a page. This includes your IP address, your browser type and version, your device type, your operating system, your approximate region as inferred from your IP address, the referring page or link that sent you to us, the pages you view, and the dates and times of those requests.",
            },
            {
              text: "We use this information in aggregate to keep the Site online, to understand load and performance, and to detect abuse. We do not use it to build an advertising profile of you, and we do not attempt to combine it with your wallet address to identify you personally.",
            },
          ],
        },
        {
          heading: "Cookies and Local Storage",
          blocks: [
            {
              text: "The Site uses browser storage, including cookies and local storage, for preferences and settings only. Examples include remembering your wallet connection state and a local copy of your optional profile username and avatar.",
            },
            {
              text: "We do not use third-party advertising cookies. We do not run ad networks or ad pixels. We do not participate in cross-site tracking, and we do not permit third parties to track you across other websites through the Site. Strictly necessary technical cookies may be set by our hosting and wallet-connection providers in order to make the Site function and to protect it from abuse.",
            },
            {
              text: "You can clear this storage at any time through your browser settings. Doing so will reset your preferences and may remove your locally stored profile.",
            },
          ],
        },
        {
          heading: "Information You Volunteer",
          blocks: [
            {
              text: "If you contact us, for example by messaging our official X account @minepea_ or by posting in our official community channels, we receive whatever you choose to send: the content of your message, your handle on that platform, and any details you include such as a wallet address or a transaction hash.",
            },
            {
              text: "Please share only what is needed to answer your question. NEVER send us a private key, a seed phrase, a recovery phrase, or a wallet password. We will never ask for them, and anyone who does is attempting to steal from you.",
            },
            {
              text: "Communications sent through third-party platforms are also governed by those platforms' own privacy policies, which we do not control.",
            },
          ],
        },
      ],
    },
    {
      heading: "How We Use Your Information",
      blocks: [
        {
          text: "We use the limited information described above for the following purposes:",
          items: [
            "To operate and display the Site, including showing live rounds, the board of tiles, your deployed ETH, round outcomes, PEA balances, staking positions, and historical analytics.",
            "To let you connect a self-custodial wallet and to read your public balances so the interface can show accurate numbers.",
            "To maintain, secure, and improve the Site, including diagnosing errors, monitoring performance, and understanding which features are used.",
            "To detect, investigate, and prevent abuse, fraud, spam, denial-of-service activity, and other conduct that threatens the Site or its users.",
            "To respond to you when you contact us through our official channels.",
            "To comply with applicable law and to respond to valid legal process.",
          ],
        },
        {
          text: "We do not use your information for behavioural advertising, and we do not sell it. We do not perform automated decision-making that produces legal or similarly significant effects about you.",
        },
      ],
    },
    {
      heading: "How You Interact With the Protocol",
      blocks: [
        {
          text: "It is worth being explicit about where the line sits, because it determines what we could disclose even if we wanted to. When you deploy ETH onto a tile, that transaction goes from your wallet to the protocol's smart contracts on the Network. It does not pass through us and we cannot stop, reverse, or reveal it beyond what the public chain already reveals to everyone.",
        },
        {
          text: "Round settlement, the drawing of the winning tile weighted by the ETH sitting on it, the pro-rata distribution of the round's ETH pot to miners who covered that tile, the flat 10% protocol fee, the buyback of PEA with 100% of that fee, the burning of 95% of the bought-back PEA and the distribution of the remaining 5% to stakers, the minting of 1.1 PEA per round, and the 1-in-633 chance of the PEAPOT dropping to the winning tile, all happen on-chain according to the protocol's code. We are describing that process here only to be clear that we do not sit in the middle of it and hold data about it that the chain does not already hold.",
        },
      ],
    },
    {
      heading: "How We Share Your Information",
      blocks: [
        {
          text: "We do not sell your information and we do not share it with data brokers. We share information only in the circumstances below.",
        },
      ],
      subsections: [
        {
          heading: "Public Blockchain Data",
          blocks: [
            {
              text: "Your on-chain activity is public by design. Every transaction you make with the protocol is broadcast to the Network and is readable by anyone, including block explorers, indexers, analytics firms, and other users. We do not publish this data, we simply read it. Once it is on-chain, we cannot make it private, restrict who sees it, or remove it.",
            },
          ],
        },
        {
          heading: "Service Providers",
          blocks: [
            {
              text: "Privy provides wallet connection for the Site, including support for email-based embedded wallets if you choose that method. If you connect through Privy, Privy will process information necessary to establish and maintain that connection, which may include an email address if you use the embedded wallet option. Privy's handling of that information is governed by Privy's own privacy policy, and you should read it before using that flow. We do not receive your private keys through Privy or through any other route.",
            },
            {
              text: "Vercel provides hosting and content delivery for the Site. Vercel processes technical request data, including IP addresses and request logs, in order to serve pages and protect the Site from abuse. Vercel's handling of that data is governed by Vercel's own privacy policy.",
            },
            {
              text: "We read public market and price data from public sources, and we read on-chain balances through a public RPC endpoint. Requests to those endpoints originate from your browser or from our infrastructure and may expose your IP address, and, in the case of balance reads, your wallet address, to the operator of the endpoint. We do not control those operators.",
            },
            {
              text: "Supabase provides the database where optional profile information (username and avatar) is stored if you choose to save a profile. Supabase processes that data on our behalf; its handling is governed by Supabase's own terms and privacy policy.",
            },
            {
              text: "We engage service providers to perform functions on our behalf and we ask them to handle information only for those functions.",
            },
          ],
        },
        {
          heading: "Legal Compliance",
          blocks: [
            {
              text: "We may disclose information where we believe in good faith that doing so is required by applicable law, regulation, subpoena, court order, or other valid legal process, or where disclosure is necessary to protect our rights, property, or safety, or the rights, property, or safety of our users or the public, or to investigate suspected fraud or a security incident.",
            },
            {
              text: "We hold very little that would be responsive to such a request. We do not hold names, emails collected by us, phone numbers, addresses, or keys.",
            },
          ],
        },
        {
          heading: "Business Transfers",
          blocks: [
            {
              text: "If NU11 LABS LLC is involved in a merger, acquisition, financing, reorganisation, sale of assets, or insolvency, information we hold may be transferred as part of that transaction. Any recipient would remain bound by this Privacy Policy with respect to information transferred, unless and until you are notified of a change.",
            },
          ],
        },
      ],
    },
    {
      heading: "Data We Do Not Collect",
      blocks: [
        {
          text: "To be direct about the boundaries:",
          items: [
            "We do not collect your real name.",
            "We do not collect an email address for our own use. If you choose Privy's email-based embedded wallet, you provide that email to Privy, not to us.",
            "We do not collect phone numbers.",
            "We do not collect postal or residential addresses.",
            "We do not collect government identification documents, and the Site does not run an identity verification process.",
            "We do not collect payment card or bank account details. The Site does not take fiat payments.",
          ],
        },
        {
          text: "WE NEVER COLLECT, REQUEST, STORE, OR HAVE ACCESS TO YOUR PRIVATE KEYS, SEED PHRASES, RECOVERY PHRASES, OR WALLET PASSWORDS. NO ONE AT NU11 LABS LLC WILL EVER ASK YOU FOR THEM. ANY MESSAGE, ACCOUNT, WEBSITE, OR PERSON CLAIMING TO REPRESENT PEA AND ASKING FOR THEM IS FRAUDULENT.",
        },
        {
          text: "WE DO NOT SELL YOUR PERSONAL INFORMATION, AND WE DO NOT SHARE IT FOR CROSS-CONTEXT BEHAVIOURAL ADVERTISING.",
        },
      ],
    },
    {
      heading: "Data Security",
      blocks: [
        {
          text: "We take reasonable technical and organisational measures appropriate to the small amount of information we handle. The Site is served over HTTPS. We limit internal access to the systems we operate. We rely on established providers, namely Privy for wallet connection and Vercel for hosting, and on their security practices for the parts of the stack they run.",
        },
        {
          text: "The most important security fact about PEA is structural: because we are non-custodial and never hold keys or funds, there is no honeypot of user assets or identity documents to breach on our side. Your assets sit in your wallet and on-chain, under your control.",
        },
        {
          text: "That control cuts both ways. You are responsible for the security of your own wallet, device, and recovery material. If you lose your seed phrase or it is stolen, we cannot recover your wallet, reverse a transaction, or restore your funds.",
        },
        {
          text: "NO METHOD OF TRANSMISSION OVER THE INTERNET OR METHOD OF ELECTRONIC STORAGE IS COMPLETELY SECURE. WHILE WE USE REASONABLE MEASURES TO PROTECT INFORMATION, WE CANNOT AND DO NOT GUARANTEE THE ABSOLUTE SECURITY OF ANY INFORMATION.",
        },
      ],
    },
    {
      heading: "Data Retention",
      blocks: [
        {
          text: "Blockchain data is permanent and immutable. Transactions recorded on the Network persist for as long as that network exists, and they are outside our control. We cannot edit, redact, or delete them, and neither can anyone else. Please treat every on-chain action as a permanent public record.",
        },
        {
          text: "Local storage and cookies remain in your browser until you clear them. You control this entirely: clearing your browser storage removes your locally stored preferences and any locally stored profile information, and you can do this at any time without asking us.",
        },
        {
          text: "Technical and log data held by our hosting provider is retained for a limited period consistent with operating and securing the Site, and is then deleted or aggregated in line with that provider's practices.",
        },
        {
          text: "Messages you send us through our official channels are retained for as long as needed to respond to you and to keep a record of the interaction, subject to the retention practices of the platform on which you sent them.",
        },
      ],
    },
    {
      heading: "Third-Party Links and Services",
      blocks: [
        {
          text: "The Site links to and depends on services we do not operate. These include block explorers, price and charting sites, our official X account, our official community channels, wallet software, and the wallet connection layer provided by Privy.",
        },
        {
          text: "When you follow a link off the Site, or when your browser talks to one of these third parties, that party's own privacy policy and terms apply, not this one. They may collect information about you, including your IP address and your wallet address, according to their own practices.",
        },
        {
          text: "We do not control these services, we are not responsible for their content or their handling of your data, and their inclusion on the Site is not an endorsement. Please review their policies before using them.",
        },
      ],
    },
    {
      heading: "Your Rights and Choices",
      blocks: [
        {
          text: "You have practical control over almost everything we touch:",
          items: [
            "Disconnect your wallet. You can disconnect at any time from the Site. Disconnecting stops the Site from reading your balances and ends the session on our side.",
            "Clear your local storage. Clearing site data in your browser removes your stored preferences and any locally stored profile information.",
            "Manage cookies. You can block or delete cookies through your browser settings. Blocking strictly necessary cookies may break parts of the Site.",
            "Edit or clear your profile. You can change or remove your optional username and avatar at any time from the profile panel; removing them deletes the stored copy from our database. Clearing your browser's site data removes the local copy as well.",
            "Simply stop using the Site. There is no account to close, no subscription to cancel, and nothing to unsubscribe from.",
          ],
        },
        {
          text: "WE CANNOT ERASE, ALTER, OR ANONYMISE ON-CHAIN RECORDS. Requests to delete, correct, or restrict blockchain data are technically impossible for us to fulfil, because that data lives on a public, immutable, decentralised network that we do not own or operate. This is a property of the technology, not a policy choice.",
        },
        {
          text: "Depending on where you live, you may have rights under local law to access, correct, delete, or restrict processing of personal information, to object to processing, to data portability, or to withdraw consent. To the extent those rights apply to information we actually hold, you may contact us through our official X account @minepea_ and we will respond as required by applicable law. In practice, we hold very little: we do not hold your identity, and we cannot connect a wallet address to a real person.",
        },
        {
          text: "You may also have the right to lodge a complaint with your local data protection authority.",
        },
      ],
    },
    {
      heading: "Children's Privacy",
      blocks: [
        {
          text: "The Site is not intended for and is not directed to anyone under 18 years of age. You must be at least 18 to use the Site or to interact with the PEA protocol through it.",
        },
        {
          text: "We do not knowingly collect information from anyone under 18. If we learn that we have collected information from someone under 18, we will delete what we hold, subject to the limits described in Data Retention: on-chain records cannot be deleted by us or by anyone.",
        },
        {
          text: "If you are a parent or guardian and believe a minor has used the Site, please contact us through our official X account @minepea_.",
        },
      ],
    },
    {
      heading: "International Users",
      blocks: [
        {
          text: "NU11 LABS LLC operates from the United States. The Site is served from global infrastructure operated by our hosting provider, and our service providers may process information in the United States and in other countries.",
        },
        {
          text: "If you access the Site from outside the United States, you understand that information relating to your use of the Site may be transferred to, stored in, and processed in countries whose data protection laws differ from those of your country of residence. Where required, we rely on appropriate safeguards for such transfers.",
        },
        {
          text: "The PEA protocol runs on a public decentralised network with nodes and participants worldwide. Data written to that network is inherently global and is not confined to any one jurisdiction.",
        },
        {
          text: "The Site is not directed to any person in a jurisdiction where using it, or the PEA protocol, would be contrary to law. You are responsible for complying with the laws that apply to you.",
        },
      ],
    },
    {
      heading: "A Note on PEA Itself",
      blocks: [
        {
          text: "For clarity, and because it bears on why we ask so little of you: PEA is a utility token used within the protocol, with a fixed maximum supply of 3,000,000 tokens. It is not offered as an investment, is not a security, and is not a claim on NU11 LABS LLC or on any entity or its assets or revenues. We do not run an account system, we do not onboard you as a customer, and we do not profile you, because there is nothing in the design that requires it.",
        },
      ],
    },
    {
      heading: "Changes to This Privacy Policy",
      blocks: [
        {
          text: "We may update this Privacy Policy from time to time to reflect changes to the Site, to our providers, or to applicable law.",
        },
        {
          text: "When we do, we will revise the \"Last updated\" date at the top of this page and post the updated policy here. If a change is material, we will make reasonable efforts to flag it through our official X account or our official community channels.",
        },
        {
          text: "Your continued use of the Site after an updated policy takes effect means you accept the updated policy. Please check this page periodically.",
        },
      ],
    },
    {
      heading: "Contact Us",
      blocks: [
        {
          text: "If you have questions about this Privacy Policy, or about how we handle information, you can reach us through our official X account @minepea_. Our official community channels are the other place we respond publicly.",
        },
        {
          text: "Please be careful about impersonation. We will only ever communicate through our official channels, and we will NEVER ask you for a private key, a seed phrase, a recovery phrase, or a wallet password, and we will never ask you to send funds to \"verify\", \"sync\", \"unlock\", or \"recover\" a wallet. Treat any such request as fraud, whatever it appears to come from.",
        },
        {
          text: "NU11 LABS LLC",
        },
      ],
    },
  ],
};

