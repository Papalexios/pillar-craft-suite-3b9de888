import React from 'react';

interface LandingPageProps {
    onEnterApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
    return (
        <div className="landing-page">
            <div className="landing-header">
                <div className="landing-header-content">
                    <div className="landing-logo-section">
                        <svg className="landing-logo-svg" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style={{ stopColor: '#3B82F6', stopOpacity: 1 }} />
                                    <stop offset="50%" style={{ stopColor: '#6366F1', stopOpacity: 1 }} />
                                    <stop offset="100%" style={{ stopColor: '#8B5CF6', stopOpacity: 1 }} />
                                </linearGradient>
                                <filter id="glow">
                                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>
                            <circle cx="30" cy="30" r="28" fill="none" stroke="url(#logoGradient)" strokeWidth="2" opacity="0.3" className="logo-ring" />
                            <path d="M 20 25 L 30 15 L 40 25 L 35 25 L 35 40 L 25 40 L 25 25 Z" fill="url(#logoGradient)" filter="url(#glow)" className="logo-arrow" />
                            <circle cx="30" cy="45" r="2" fill="url(#logoGradient)" className="logo-dot" />
                        </svg>
                        <div className="landing-logo-text">
                            <h1>WP Content Optimizer <span className="pro-badge">PRO</span></h1>
                            <p className="landing-tagline">From the creators of <a href="https://affiliatemarketingforsuccess.com" target="_blank" rel="noopener noreferrer">AffiliateMarketingForSuccess.com</a></p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="landing-content">
                <div className="landing-hero">
                    <div className="floating-orb orb-1"></div>
                    <div className="floating-orb orb-2"></div>
                    <div className="floating-orb orb-3"></div>

                    <h2 className="landing-hero-title">
                        Transform Your Content Into<br />
                        <span className="gradient-text">Ranking Machines</span>
                    </h2>
                    <p className="landing-hero-subtitle">
                        AI-powered SEO optimization that adapts to Google's algorithm in real-time.<br />
                        Generate, optimize, and publish content that dominates search results.
                    </p>

                    <div className="landing-cta-buttons">
                        <button className="btn btn-primary-lg" onClick={onEnterApp}>
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M10 2L12 8H18L13 12L15 18L10 14L5 18L7 12L2 8H8L10 2Z" fill="currentColor" />
                            </svg>
                            Launch Optimizer
                        </button>
                        <a href="https://seo-hub.affiliatemarketingforsuccess.com/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary-lg">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M10 3V17M10 17L15 12M10 17L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Dominate Your Niche – Unlock Your Complete AI-Powered SEO Arsenal
                        </a>
                    </div>
                </div>

                <div className="landing-features">
                    <div className="feature-card">
                        <div className="feature-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3>God Mode 2.0</h3>
                        <p>Autonomous content optimization that never sleeps. Set it and forget it while your content climbs the rankings.</p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m6 6v-6m-6 0h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3>SOTA Analysis</h3>
                        <p>State-of-the-art content analysis using NLP, entity extraction, and competitor insights powered by NeuronWriter.</p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3>Bulk Publishing</h3>
                        <p>Generate and publish hundreds of optimized articles with one click. Scale your content empire effortlessly.</p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2v20m0-20a9 9 0 019 9h-9V2zm0 20a9 9 0 01-9-9h9v9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3>Rank Guardian</h3>
                        <p>Real-time monitoring and automatic fixes for content health. Protect your rankings 24/7 with AI-powered alerts.</p>
                    </div>
                </div>
            </div>

            <footer className="landing-footer">
                <div className="landing-footer-content">
                    <div className="footer-brand">
                        <img
                            src="https://affiliatemarketingforsuccess.com/wp-content/uploads/2023/03/cropped-Affiliate-Marketing-for-Success-Logo-Edited.png"
                            alt="Affiliate Marketing for Success Logo"
                            className="footer-logo"
                        />
                        <div className="footer-info">
                            <p className="footer-credit">Created by <strong>Alexios Papaioannou</strong></p>
                            <p className="footer-site">Owner of <a href="https://affiliatemarketingforsuccess.com" target="_blank" rel="noopener noreferrer">affiliatemarketingforsuccess.com</a></p>
                        </div>
                    </div>
                    <div className="footer-links">
                        <h4>Learn More About:</h4>
                        <ul>
                            <li><a href="https://affiliatemarketingforsuccess.com/affiliate-marketing" target="_blank" rel="noopener noreferrer">Affiliate Marketing</a></li>
                            <li><a href="https://affiliatemarketingforsuccess.com/ai" target="_blank" rel="noopener noreferrer">AI</a></li>
                            <li><a href="https://affiliatemarketingforsuccess.com/seo" target="_blank" rel="noopener noreferrer">SEO</a></li>
                            <li><a href="https://affiliatemarketingforsuccess.com/blogging" target="_blank" rel="noopener noreferrer">Blogging</a></li>
                            <li><a href="https://affiliatemarketingforsuccess.com/review" target="_blank" rel="noopener noreferrer">Reviews</a></li>
                        </ul>
                    </div>
                </div>
                <div className="footer-bottom">
                    <p>&copy; 2024 Affiliate Marketing for Success. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};
