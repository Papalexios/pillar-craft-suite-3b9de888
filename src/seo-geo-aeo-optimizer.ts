// 🌍 ENTERPRISE GEO + AEO OPTIMIZER v2.0
// Multi-region SEO with Answer Engine Optimization

export interface GeoTarget {
  country: string;
  countryCode: string;
  language: string;
  cities: string[];
  currency: string;
  timezone: string;
}

export interface AEOQuestion {
  question: string;
  type: 'what' | 'how' | 'why' | 'when' | 'where' | 'who' | 'which';
  priority: 'high' | 'medium' | 'low';
}

export interface GeoAEOResult {
  geoTargets: GeoTarget[];
  aeoQuestions: AEOQuestion[];
  schemaRecommendations: string[];
  keywordClusters: Record<string, string[]>;
  localSEOTips: string[];
}

// Comprehensive geo-targeting database
const GEO_TARGETS: GeoTarget[] = [
  {
    country: 'United States',
    countryCode: 'US',
    language: 'en-US',
    cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'],
    currency: 'USD',
    timezone: 'America/New_York'
  },
  {
    country: 'United Kingdom',
    countryCode: 'GB',
    language: 'en-GB',
    cities: ['London', 'Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Leeds', 'Sheffield', 'Edinburgh', 'Bristol', 'Leicester'],
    currency: 'GBP',
    timezone: 'Europe/London'
  },
  {
    country: 'Germany',
    countryCode: 'DE',
    language: 'de-DE',
    cities: ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Dortmund', 'Essen', 'Leipzig'],
    currency: 'EUR',
    timezone: 'Europe/Berlin'
  },
  {
    country: 'France',
    countryCode: 'FR',
    language: 'fr-FR',
    cities: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille'],
    currency: 'EUR',
    timezone: 'Europe/Paris'
  },
  {
    country: 'Canada',
    countryCode: 'CA',
    language: 'en-CA',
    cities: ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener'],
    currency: 'CAD',
    timezone: 'America/Toronto'
  },
  {
    country: 'Australia',
    countryCode: 'AU',
    language: 'en-AU',
    cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra', 'Newcastle', 'Wollongong', 'Logan City'],
    currency: 'AUD',
    timezone: 'Australia/Sydney'
  }
];

// AEO question templates
const AEO_TEMPLATES = {
  what: ['What is {topic}?', 'What are the benefits of {topic}?', 'What does {topic} mean?', 'What makes {topic} important?'],
  how: ['How does {topic} work?', 'How to use {topic}?', 'How can {topic} help?', 'How to get started with {topic}?'],
  why: ['Why is {topic} important?', 'Why choose {topic}?', 'Why does {topic} matter?', 'Why should you consider {topic}?'],
  when: ['When to use {topic}?', 'When is {topic} most effective?', 'When should you start with {topic}?'],
  where: ['Where can you find {topic}?', 'Where is {topic} available?', 'Where to buy {topic}?'],
  who: ['Who needs {topic}?', 'Who benefits from {topic}?', 'Who should use {topic}?'],
  which: ['Which {topic} is best?', 'Which {topic} should you choose?', 'Which {topic} works better?']
};

/**
 * Generate geo-targeted optimization strategy
 */
export function generateGeoStrategy(topic: string, targetCountries: string[] = ['US', 'GB', 'DE']): GeoAEOResult {
  // Filter geo targets
  const geoTargets = GEO_TARGETS.filter(t => targetCountries.includes(t.countryCode));
  
  // Generate AEO questions
  const aeoQuestions: AEOQuestion[] = [];
  Object.entries(AEO_TEMPLATES).forEach(([type, templates]) => {
    templates.forEach((template, index) => {
      aeoQuestions.push({
        question: template.replace('{topic}', topic),
        type: type as AEOQuestion['type'],
        priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low'
      });
    });
  });
  
  // Generate keyword clusters by geo
  const keywordClusters: Record<string, string[]> = {};
  geoTargets.forEach(target => {
    const baseKeywords = [
      `${topic} ${target.country}`,
      `${topic} near me`,
      `best ${topic} in ${target.country}`,
      `${topic} ${target.cities[0]}`, // Top city
      `${topic} online ${target.countryCode}`
    ];
    
    // Add city-level keywords for top 3 cities
    target.cities.slice(0, 3).forEach(city => {
      baseKeywords.push(`${topic} ${city}`);
      baseKeywords.push(`${topic} near ${city}`);
    });
    
    keywordClusters[target.countryCode] = baseKeywords;
  });
  
  // Schema recommendations
  const schemaRecommendations = [
    '🎯 Add FAQPage schema for all AEO questions',
    '📍 Implement LocalBusiness schema with NAP (Name, Address, Phone)',
    '🏢 Add Organization schema with geo-specific contact info',
    '⭐ Include AggregateRating schema for trust signals',
    '🗺️ Add GeoCoordinates for physical locations',
    '📞 Implement ContactPoint schema with area-specific numbers',
    '⏰ Add OpeningHours schema for location-based businesses',
    '🎫 Use Product schema with regional pricing and availability'
  ];
  
  // Local SEO tips
  const localSEOTips = [
    '📝 Create separate landing pages for each major city',
    '🗺️ Embed Google Maps for physical locations',
    '📞 Display local phone numbers prominently',
    '⭐ Encourage customer reviews on Google Business Profile',
    '🏷️ Use hreflang tags for multi-language versions',
    '📍 Optimize for "near me" searches with location-specific content',
    '🎯 Include city/region names in title tags and H1s',
    '📊 Set up Google Business Profile for each location',
    '🌐 Build local backlinks from regional directories',
    '📱 Ensure mobile-friendly design for on-the-go searches',
    '💬 Add location-specific testimonials and case studies',
    '🔖 Create location pages in XML sitemap',
    '📸 Add geo-tagged images with alt text',
    '🎓 Publish location-specific blog posts and guides',
    '🤝 Partner with local businesses for co-marketing'
  ];
  
  return {
    geoTargets,
    aeoQuestions,
    schemaRecommendations,
    keywordClusters,
    localSEOTips
  };
}

/**
 * Generate FAQ schema markup from AEO questions
 */
export function generateFAQSchema(questions: AEOQuestion[], baseUrl: string): string {
  const faqItems = questions
    .filter(q => q.priority === 'high' || q.priority === 'medium')
    .slice(0, 10) // Google typically shows 10
    .map(q => ({
      '@type': 'Question',
      'name': q.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': `Learn everything about ${q.question.toLowerCase()}. Visit ${baseUrl} for detailed information.`
      }
    }));
  
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqItems
  };
  
  return JSON.stringify(schema, null, 2);
}

/**
 * Generate LocalBusiness schema
 */
export function generateLocalBusinessSchema(
  name: string,
  address: string,
  city: string,
  state: string,
  zip: string,
  country: string,
  phone: string,
  geo: { lat: number; lng: number }
): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    'name': name,
    'image': 'https://example.com/logo.jpg',
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': address,
      'addressLocality': city,
      'addressRegion': state,
      'postalCode': zip,
      'addressCountry': country
    },
    'geo': {
      '@type': 'GeoCoordinates',
      'latitude': geo.lat,
      'longitude': geo.lng
    },
    'telephone': phone,
    'openingHoursSpecification': [
      {
        '@type': 'OpeningHoursSpecification',
        'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        'opens': '09:00',
        'closes': '17:00'
      }
    ],
    'priceRange': '$$'
  };
  
  return JSON.stringify(schema, null, 2);
}

/**
 * Generate hreflang tags for multi-language pages
 */
export function generateHreflangTags(baseUrl: string, geoTargets: GeoTarget[]): string[] {
  const tags: string[] = [];
  
  geoTargets.forEach(target => {
    const url = `${baseUrl}/${target.countryCode.toLowerCase()}/`;
    tags.push(`<link rel="alternate" hreflang="${target.language}" href="${url}" />`);
  });
  
  // Add x-default for fallback
  tags.push(`<link rel="alternate" hreflang="x-default" href="${baseUrl}/" />`);
  
  return tags;
}

/**
 * Optimize content for "near me" searches
 */
export function optimizeForNearMe(content: string, location: string): string {
  const nearMePhrases = [
    `Find ${content} near you in ${location}`,
    `Looking for ${content} nearby? We're located in ${location}`,
    `Local ${content} services in ${location}`,
    `${location} ${content} - Open Now`,
    `Best ${content} near ${location}`
  ];
  
  return nearMePhrases.join('\n');
}

/**
 * Export complete geo + AEO strategy as JSON
 */
export function exportGeoAEOStrategy(topic: string, countries: string[]): string {
  const strategy = generateGeoStrategy(topic, countries);
  
  return JSON.stringify({
    generated: new Date().toISOString(),
    topic,
    targetCountries: countries,
    ...strategy,
    faqSchema: generateFAQSchema(strategy.aeoQuestions, 'https://example.com'),
    hreflangTags: generateHreflangTags('https://example.com', strategy.geoTargets)
  }, null, 2);
}
