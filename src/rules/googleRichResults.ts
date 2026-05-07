import type { RichResultRule, RuleValueShape } from "../analyzer/types";

const docsBase = "https://developers.google.com/search/docs/appearance/structured-data";
const lastReviewed = "2026-05-07";
const partialCoverageNote = "Initial bundled rule coverage. Required/recommended fields and value-shape checks need manual verification against representative real pages before findings can be considered reliable.";

export const googleRichResultRules: RichResultRule[] = [
  rule("article", "Article", ["Article", "BlogPosting", "NewsArticle"], "article", ["headline", "image", "datePublished", "author.name"], ["dateModified", "publisher.name"]),
  rule("book", "Book", ["Book"], "book", ["name", "author.name", "url"], ["workExample"]),
  rule("breadcrumb", "Breadcrumb", ["BreadcrumbList"], "breadcrumb", ["itemListElement"], ["itemListElement.name", "itemListElement.item"]),
  rule("carousel", "Carousel", ["ItemList"], "carousel", ["itemListElement"], ["itemListElement.position", "itemListElement.url"]),
  rule("course", "Course", ["Course"], "course", ["name", "description", "provider.name"], ["offers", "hasCourseInstance"]),
  rule("course-info", "Course Info", ["Course"], "course-info", ["name", "description", "provider"], ["educationalCredentialAwarded", "offers", "hasCourseInstance"]),
  rule("dataset", "Dataset", ["Dataset"], "dataset", ["name", "description"], ["creator", "license", "distribution"]),
  rule("discussion-forum", "Discussion Forum", ["DiscussionForumPosting"], "discussion-forum", ["headline", "author", "datePublished", "text"], ["comment", "interactionStatistic"]),
  rule("employer-rating", "Employer Aggregate Rating", ["EmployerAggregateRating"], "employer-rating", ["itemReviewed", "ratingValue", "bestRating", "worstRating"], ["ratingCount"]),
  rule("event", "Event", ["Event"], "event", ["name", "startDate", "location", "image", "description"], ["endDate", "eventStatus", "offers", "performer"]),
  rule("fact-check", "Fact Check", ["ClaimReview"], "factcheck", ["claimReviewed", "reviewRating", "author", "itemReviewed"], ["datePublished", "url"]),
  rule("faq", "FAQ", ["FAQPage"], "faqpage", ["mainEntity"], ["mainEntity.name", "mainEntity.acceptedAnswer.text"]),
  rule("how-to", "HowTo", ["HowTo"], "how-to", ["name", "step"], ["image", "totalTime", "supply", "tool"]),
  rule("image-license", "Image Metadata", ["ImageObject"], "image-license-metadata", ["contentUrl"], ["license", "acquireLicensePage", "creditText"]),
  rule("job-posting", "Job Posting", ["JobPosting"], "job-posting", ["title", "description", "datePosted", "hiringOrganization", "jobLocation"], ["validThrough", "employmentType", "baseSalary"]),
  rule("learning-video", "Learning Video", ["LearningResource", "VideoObject"], "learning-video", ["name", "description", "thumbnailUrl", "uploadDate"], ["educationalLevel", "learningResourceType", "duration"]),
  rule("local-business", "Local Business", ["LocalBusiness", "Restaurant", "Store"], "local-business", ["name", "address"], ["telephone", "openingHours", "priceRange", "geo"]),
  rule("math-solver", "Math Solver", ["MathSolver"], "math-solvers", ["name", "url", "potentialAction"], ["usageInfo"]),
  rule("movie", "Movie", ["Movie"], "movie", ["name", "image", "dateCreated", "director"], ["review", "aggregateRating"]),
  rule("organization", "Organization", ["Organization"], "organization", ["name", "url"], ["logo", "sameAs", "contactPoint"]),
  rule("practice-problem", "Practice Problem", ["Quiz", "Question"], "practice-problems", ["name", "educationalAlignment", "hasPart"], ["about", "assesses"]),
  rule("product", "Product", ["Product"], "product", ["name", "image"], ["description", "offers.price", "offers.priceCurrency", "aggregateRating.ratingValue", "review"]),
  rule("profile-page", "Profile Page", ["ProfilePage"], "profile-page", ["mainEntity"], ["mainEntity.name", "mainEntity.interactionStatistic"]),
  rule("qa-page", "Q&A Page", ["QAPage"], "qapage", ["mainEntity"], ["mainEntity.name", "mainEntity.acceptedAnswer.text"]),
  rule("recipe", "Recipe", ["Recipe"], "recipe", ["name", "image", "recipeIngredient", "recipeInstructions"], ["author", "datePublished", "prepTime", "cookTime", "aggregateRating"]),
  rule("review-snippet", "Review Snippet", ["Review", "AggregateRating"], "review-snippet", ["itemReviewed", "ratingValue"], ["author", "reviewBody", "bestRating", "worstRating"]),
  rule("software-app", "Software App", ["SoftwareApplication"], "software-app", ["name", "operatingSystem", "applicationCategory"], ["offers", "aggregateRating"]),
  rule("speakable", "Speakable", ["SpeakableSpecification"], "speakable", ["cssSelector"], ["xpath"]),
  rule("special-announcement", "Special Announcement", ["SpecialAnnouncement"], "special-announcements", ["name", "text", "datePosted"], ["expires", "category", "spatialCoverage"]),
  rule("vacation-rental", "Vacation Rental", ["VacationRental", "LodgingBusiness"], "vacation-rental", ["name", "address", "image"], ["containsPlace", "amenityFeature", "aggregateRating"]),
  rule("vehicle-listing", "Vehicle Listing", ["Car", "Vehicle"], "vehicle-listing", ["name", "vehicleIdentificationNumber", "brand", "model"], ["offers", "mileageFromOdometer", "vehicleConfiguration"]),
  rule("video", "Video", ["VideoObject"], "video", ["name", "description", "thumbnailUrl", "uploadDate"], ["duration", "contentUrl", "embedUrl", "transcript"]),
];

function rule(
  id: string,
  name: string,
  schemaTypes: string[],
  slug: string,
  required: string[],
  recommended: string[],
): RichResultRule {
  return {
    id,
    name,
    schemaTypes,
    sourceUrl: `${docsBase}/${slug}`,
    status: "partial",
    lastReviewed,
    notes: partialCoverageNote,
    required: required.map((path) => ({ path, hint: `Add ${path} for ${name} rich result eligibility.`, valueShape: inferValueShape(path) })),
    recommended: recommended.map((path) => ({ path, hint: `Consider adding ${path} to improve ${name} structured data quality.`, valueShape: inferValueShape(path) })),
  };
}

function inferValueShape(path: string): RuleValueShape {
  const lower = path.toLowerCase();
  if (lower.includes("date") || lower === "expires") return "date";
  if (lower.includes("ratingvalue") || lower.includes("bestrating") || lower.includes("worstrating")) return "rating";
  if (lower.includes("price") || lower.includes("ratingcount")) return "number";
  if (lower.includes("url") || lower.includes("contenturl") || lower.includes("embedurl") || lower.includes("license") || lower.includes("sameas")) return "url";
  if (lower.includes("image") || lower.includes("logo") || lower.includes("thumbnailurl")) return "url-or-object";
  return "non-empty";
}
