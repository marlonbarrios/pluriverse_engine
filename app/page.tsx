'use client'
import { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as fal from '@fal-ai/serverless-client';
import Image from 'next/image';
import Head from 'next/head';

fal.config({
  proxyUrl: '/api/fal/proxy',
  credentials: process.env.NEXT_PUBLIC_FAL_KEY,
});

const seed = Math.floor(Math.random() * 100000);

export default function Home() {
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [strength, setStrength] = useState(0.49);
  const [audioSrc, setAudioSrc] = useState('/bauhaus.mp3');
  const [currentWorld, setCurrentWorld] = useState(-1);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lang, setLang] = useState<'es' | 'en' | 'fr' | 'de' | 'pt' | 'tr'>('es');
  const [lastUpdated, setLastUpdated] = useState('');
  const [isWebcamBW, setIsWebcamBW] = useState(false);
  type RealtimeModel = { label: string; key: string; room: string };
  const defaultModels: RealtimeModel[] = [
    { label: 'fast-lightning-sdxl', key: 'fal-ai/fast-lightning-sdxl', room: '110602490-sdxl-turbo-realtime' },
    { label: 'sdxl-turbo-realtime', key: 'sdxl-turbo-realtime', room: '110602490-sdxl-turbo-realtime' },
  ];
  const [models, setModels] = useState<RealtimeModel[]>(defaultModels);
  const [selectedModelKey, setSelectedModelKey] = useState<string>(defaultModels[0].key);
  const [isManagingModels, setIsManagingModels] = useState(false);
  const [newModelLabel, setNewModelLabel] = useState('');
  const [newModelKey, setNewModelKey] = useState('');
  const [newModelRoom, setNewModelRoom] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [imgWidth, setImgWidth] = useState(768);
  const [imgHeight, setImgHeight] = useState(768);
  const [guidanceScale, setGuidanceScale] = useState(1.5);
  const [steps, setSteps] = useState(4);
  const [negativePrompt, setNegativePrompt] = useState('blurry, lowres, deformed, extra limbs, text');
  const [seedValue, setSeedValue] = useState<number | ''>('');
  const [llmModelKey, setLlmModelKey] = useState<string>('google/gemini-flash-1.5');
  const [isLLMGenerating, setIsLLMGenerating] = useState(false);
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [generatedEssay, setGeneratedEssay] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  
  // Simple defensive setters - minimal processing
  const setSafeGeneratedTitle = (value: string | ((prev: string) => string)) => {
    if (typeof value === 'function') {
      setGeneratedTitle(prev => {
        const newVal = value(prev);
        // Light cleaning only if obvious JSON artifacts
        if (newVal.includes('```json') || newVal.includes('"title_delta"')) {
          return newVal.replace(/```json/g, '').replace(/```/g, '').replace(/\{[^}]*"title_delta"[^}]*\}/g, '').trim();
        }
        return newVal;
      });
    } else {
      // Light cleaning only if obvious JSON artifacts
      if (value.includes('```json') || value.includes('"title_delta"')) {
        setGeneratedTitle(value.replace(/```json/g, '').replace(/```/g, '').replace(/\{[^}]*"title_delta"[^}]*\}/g, '').trim());
      } else {
        setGeneratedTitle(value);
      }
    }
  };
  
  const setSafeGeneratedEssay = (value: string | ((prev: string) => string)) => {
    if (typeof value === 'function') {
      setGeneratedEssay(prev => {
        const newVal = value(prev);
        // Light cleaning only if obvious JSON artifacts
        if (newVal.includes('```json') || newVal.includes('"essay_delta"')) {
          return newVal.replace(/```json/g, '').replace(/```/g, '').replace(/\{[^}]*"essay_delta"[^}]*\}/g, '').trim();
        }
        return newVal;
      });
    } else {
      // Light cleaning only if obvious JSON artifacts
      if (value.includes('```json') || value.includes('"essay_delta"')) {
        setGeneratedEssay(value.replace(/```json/g, '').replace(/```/g, '').replace(/\{[^}]*"essay_delta"[^}]*\}/g, '').trim());
      } else {
        setGeneratedEssay(value);
      }
    }
  };

  const setSafeGeneratedPrompt = (value: string | ((prev: string) => string)) => {
    if (typeof value === 'function') {
      setGeneratedPrompt(prev => {
        const newVal = value(prev);
        // Light cleaning only if obvious JSON artifacts
        if (newVal.includes('```json') || newVal.includes('"prompt_delta"')) {
          return newVal.replace(/```json/g, '').replace(/```/g, '').replace(/\{[^}]*"prompt_delta"[^}]*\}/g, '').trim();
        }
        return newVal;
      });
    } else {
      // Light cleaning only if obvious JSON artifacts
      if (value.includes('```json') || value.includes('"prompt_delta"')) {
        setGeneratedPrompt(value.replace(/```json/g, '').replace(/```/g, '').replace(/\{[^}]*"prompt_delta"[^}]*\}/g, '').trim());
      } else {
        setGeneratedPrompt(value);
      }
    }
  };
  const [llmStreaming, setLlmStreaming] = useState(false);
  // Remove any structured/JSON-like fragments from text for display only
  const sanitizeDisplay = (s: string) => {
    if (!s) return '';
    
    // If the string doesn't contain JSON artifacts, return it as-is
    if (!s.includes('{') && !s.includes('```') && !s.includes('title_delta') && !s.includes('prompt_delta')) {
      return s.trim();
    }
    
    // Remove fence blocks but preserve content inside if it's not JSON
    let t = s.replace(/```json\s*\n/g, '').replace(/```\s*\n/g, '').replace(/```json/g, '').replace(/```/g, '');
    
    // Only remove complete JSON objects, not partial matches
    t = t.replace(/\{\s*"[^"]*"\s*:\s*"[^"]*"\s*\}/g, ''); // Remove complete JSON objects
    
    const lines = t.split(/\r?\n/);
    const filtered = lines.filter((line) => {
      const x = line.trim();
      if (!x) return false;
      
      // Only skip lines that are PURE JSON syntax
      if (/^\s*[{\[]/.test(x) && /[}\]]\s*$/.test(x)) return false;
      if (/^\s*"[^"]*"\s*:\s*"[^"]*"\s*$/.test(x)) return false;
      if (/^\s*[,}]\s*$/.test(x)) return false;
      
      return true;
    });
    
    return filtered.join('\n').trim();
  };
  const stripLabels = (s: string) => {
    if (!s) return '';
    let t = s.replace(/^```json\s*$/gim, '').replace(/^```\s*$/gim, '');
    t = t.replace(/^\s*(Title|Prompt)\s*:?\s*/gim, '');
    return t.trim();
  };
  const sanitizeDelta = (s: string) => {
    if (!s) return '';
    
    // If it's already clean text (from parsed JSON), just clean up escapes and return
    if (typeof s === 'string' && !s.includes('{') && !s.includes('"title') && !s.includes('"prompt') && !s.includes('```')) {
      return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    }
    
    // Light cleaning for streaming - just remove obvious JSON wrappers
    let cleaned = s.trim();
    
    // Remove JSON field labels but keep the content
    cleaned = cleaned.replace(/^\s*"?title_delta"?\s*:\s*"?/i, '').replace(/"?\s*$/i, '');
    cleaned = cleaned.replace(/^\s*"?prompt_delta"?\s*:\s*"?/i, '').replace(/"?\s*$/i, '');
    cleaned = cleaned.replace(/^\s*"?title"?\s*:\s*"?/i, '').replace(/"?\s*$/i, '');
    cleaned = cleaned.replace(/^\s*"?prompt"?\s*:\s*"?/i, '').replace(/"?\s*$/i, '');
    
    // Clean up escape sequences
    cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    
    return cleaned.trim();
  };

  // Check if a line is obviously JSON and should be skipped from display
  const isJsonLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    
    // JSON structure indicators
    if (/^[{\[]/.test(trimmed) || /[}\]]$/.test(trimmed)) return true;
    if (/^\s*"[^"]*"\s*:\s*/.test(trimmed)) return true;
    if (/^\s*[,}]\s*$/.test(trimmed)) return true;
    if (/"(title_delta|prompt_delta|title|prompt|output)"\s*:/.test(trimmed)) return true;
    
    return false;
  };

  // Try to parse a JSON object embedded in a string (possibly inside code fences)
  const tryParseInnerJson = (s: string): any | null => {
    if (!s) return null;
    const withoutFences = s.replace(/```[\s\S]*?```/g, s => s.replace(/```/g, ''));
    const start = withoutFences.indexOf('{');
    const end = withoutFences.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const candidate = withoutFences.slice(start, end + 1);
      try { return JSON.parse(candidate); } catch {}
    }
    return null;
  };
  const [customNames, setCustomNames] = useState<Record<'en' | 'es' | 'fr' | 'de' | 'pt' | 'tr', Record<number, string>>>({ en: {}, es: {}, fr: {}, de: {}, pt: {}, tr: {} });
  const [customPrompts, setCustomPrompts] = useState<Record<'en' | 'es' | 'fr' | 'de' | 'pt' | 'tr', Record<number, string>>>({ en: {}, es: {}, fr: {}, de: {}, pt: {}, tr: {} });
  const [customImagePrompts, setCustomImagePrompts] = useState<Record<'en' | 'es' | 'fr' | 'de' | 'pt' | 'tr', Record<number, string>>>({ en: {}, es: {}, fr: {}, de: {}, pt: {}, tr: {} });
  const [isEditingActive, setIsEditingActive] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');

  const webcamRef = useRef<Webcam>(null);


  // 10 Decolonial Multiverse and Technofuture Prompts (EN)
  const worldPromptsEN = [
    // 0 - Expanded Kené (Shipibo-Konibo)
    'Shipibo-Konibo populations from Peruvian Amazonia, hyperrealistic ONE human body, wearing embroidered garments with kené patterns functioning as interactive screens, background of floating Amazonian city with walls vibrating in visionary geometries, natural and technological lighting fused, 8K photorealistic details, honoring pueblos originarios',
    
    // 1 - Algorithmic Ifá (Yoruba)
    'Yoruba populations from Nigeria and Benin, hyperrealistic ONE human body, wearing turbans with oral memory sensors storing proverbs, in futuristic Lagos with screens showing the 256 odù of Ifá, warm golden lighting, 8K photorealistic details, honoring pueblos originarios',
    
    // 2 - Holographic Joik (Sami)
    'Sami populations from Scandinavia, hyperrealistic ONE human body, in polar suits of reflective fibers, singing joik while holograms of reindeer and Arctic landscapes appear, background of Tromsø with northern lights, Arctic natural lighting, 8K photorealistic details, honoring pueblos originarios',
    
    // 3 - Digital Tzolk\'in (Maya)
    'Maya populations from Mesoamerica, hyperrealistic ONE human body, wearing huipiles with microchips that change colors according to sacred days, in Mérida with screens marking Maya cyclical time, ceremonial lighting, 8K photorealistic details, honoring pueblos originarios',
    
    // 4 - Expanded Gnawa Chants (Morocco)
    'Gnawa populations from Morocco, hyperrealistic ONE human body, with tunics vibrating to the rhythm of metallic krakebs, in Casablanca where hospitals begin days with gnawa lila, warm morning lighting, 8K photorealistic details, honoring pueblos originarios',
    
    // 5 - Asian Techno-Spiritual Awakening
    'of East or South Asian origin, hyperrealistic ONE human body, in meditation poses with traditional robes enhanced with LED technology, floating mandalas with intricate patterns, zen gardens with holographic elements, simple zen background with clean lines, serene dramatic lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
    // 6 - Pacific Islander Ocean Tech
    'of Polynesian or Melanesian origin, hyperrealistic ONE human body, in aquatic cyber-suits with coral and shell patterns on technology, underwater cityscapes, bioluminescent effects, simple deep blue background with subtle water effects, deep blue dramatic lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
    // 7 - Middle Eastern Digital Oasis
    'of Arab or Persian origin, hyperrealistic ONE human body, in flowing digital robes, desert landscapes with holographic palm trees, geometric Islamic art patterns, simple desert background with clean horizon, golden hour lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
    // 8 - South Asian Cyber Temple
    'of Indian or Pakistani origin, hyperrealistic ONE human body, in futuristic traditional attire, digital lotus flowers with intricate details, holographic deities, simple temple background with clean architecture, spiritual dramatic lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
    // 9 - Global Mash-Up Revolution
    'representing global diversity from any continent, hyperrealistic ONE human body, in revolutionary techno-fashion, cultural symbols from around the world merged with futuristic elements, rainbow of ethnicities, simple world map background with clean lines, revolutionary dramatic lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 10 - Meme Bard Renaissance
    'hyperrealistic ONE human body dressed as a renaissance jester-bard with holographic meme scrolls, emoji-lutes, floating captions, simple parchment background with clean flourishes, theatrical spotlight lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 11 - Influencer Jungle Safari
    'hyperrealistic ONE human body in neon explorer gear with ring-light halo and camera drones as fireflies, oversized branded water bottle, simple tropical background with clean silhouettes, glossy dramatic lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 12 - Bureaucracy Labyrinth Boss Level
    'hyperrealistic ONE human body in labyrinth of endless folders and rubber stamps, wearable desk armor with sticky-note runes, simple office background with crisp vanishing lines, cool fluorescent lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 13 - Retro VHS Aerobics Utopia
    'hyperrealistic ONE human body in shimmering 80s spandex with pixelated sweatband effects, VHS scanlines, chrome gradients, simple grid background with sunrise horizon, studio strobe lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 14 - Pizza Mecha Delivery Rush
    'hyperrealistic ONE human body piloting a compact delivery mecha with pizza-slice shoulder plates, steaming box thrusters, speed lines, simple city alley background with clean geometry, warm streetlight lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 15 - Coffee Overlords Bean Temple
    'hyperrealistic ONE human body in barista-ritual robes with latte-art sigils, floating portafilter relics, bean comets, simple minimal cafe background with soft textures, amber glow lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 16 - Quantum Cat Herding League
    'hyperrealistic ONE human body in sleek suit with entangled yarn emitters, translucent cats phasing in and out, pawprint constellations, simple starfield background with clear shapes, playful rim lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 17 - Disco Archivist Datavault
    'hyperrealistic ONE human body in glittering librarian attire, mirror-disk codexes orbiting, cable tassels, simple archival stacks background with bold symmetry, saturated spotlight lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 18 - Crypto Moon Miner Karaoke
    'hyperrealistic ONE human body in space overalls with LED mic, coin-shaped asteroids, bouncing equalizer bars, simple lunar surface background with clean horizon, cool neon rim lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 19 - Cloud Wizard Debug Arena
    'hyperrealistic ONE human body as a robe-wearing sys-wizard with glowing terminal staff, code sigils in the air, floating bug familiars, simple cloud server background with minimal icons, icy studio lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 20 - Pluriversal Assembly Nexus
    'of Global South scholar-activist origin, hyperrealistic ONE human body, in polycultural ceremonial tech-garments with woven circuits, orbiting translation orbs, simple amphitheater background with concentric rings, warm inclusive lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 21 - Border Thinking Commons
    'of borderlands mestiza origin, hyperrealistic ONE human body, wearing hybrid textile-silicon cloak, glitch-text poetry banners, simple footbridge background with clean horizon, golden rim lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
    // 22 - Indigenous Knowledge Systems
    'of Indigenous origin, hyperrealistic ONE human body, adorned with intricate, bioluminescent tattoos representing constellations significant to the Mapuche people, standing confidently within a network of interconnected, floating islands powered by geothermal energy; lush vegetation thrives across the islands, seamlessly connecting natural and technological elements in a harmonious blend of ancestral practices and futuristic technology, simple aurora background with clean sky patterns, dramatic northern lights lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 22 - Transmodernity Agora
    'of intercultural philosopher origin, hyperrealistic ONE human body, in reflective modular armor etched with pluriversal scripts, floating debate plinths, simple marble plaza background with minimal columns, crisp studio lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 23 - Socialized Power Mesh
    'of community organizer origin, hyperrealistic ONE human body, in networked exosuit with cooperative node lights, sharing halos, simple neighborhood background with clean grid, soft dawn lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 24 - Heterarchy Signal Garden
    'of multispecies caretaker origin, hyperrealistic ONE human body, in biocircuit overgrowth with antennae flowers and data-vines, simple terraced garden background with clear paths, verdant diffuse lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 25 - Critical Cosmopolitan Forge
    'of diasporic artisan origin, hyperrealistic ONE human body, in blacksmith-lab coat with molten code rivulets, hammering glowing treaties, simple workshop background with clean geometry, ember glow lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 26 - Epistemic South Observatory
    'of Afro-Indigenous researcher origin, hyperrealistic ONE human body, in star-mapped shawl and sensor bracelets, constellations labeled with local names, simple night sky background with minimal horizon, lunar cool lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 27 - Coloniality Debug Lab
    'of decolonial analyst origin, hyperrealistic ONE human body, in lab overcoat with redlined maps dissolving into free patterns, hovering bug-report sigils, simple lab background with clean benches, neutral key lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 28 - Diversality Constellation
    'of polyglot navigator origin, hyperrealistic ONE human body, in prism-scarf diffracting languages into light, small companion stars as voices, simple deep space background with sparse markers, iridescent rim lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 29 - Geopolitics of Knowledge Atrium
    'of migrant librarian origin, hyperrealistic ONE human body, in archive-sleeves with map-ink veins, levitating open-source atlases, simple atrium background with clean arches, warm library lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 30 - Body-Politics Resonator
    'of queer transfeminist origin, hyperrealistic ONE human body, in resonance suit translating heartbeat to public signal, chorus of silhouettes, simple auditorium background with clean lines, magenta-blue stage lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 31 - Decolonial Datavault
    'of Indigenous data steward origin, hyperrealistic ONE human body, in key-weave poncho and cryptographic beadwork, consent glyphs orbiting, simple vault background with minimal facets, cool secure lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 32 - Subaltern Signal Studio
    'of street broadcaster origin, hyperrealistic ONE human body, in portable radio rig with mesh antennas and stickered consoles, community waves visible, simple rooftop background with clean skyline, sunset amber lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 33 - Zapatista Cloud Commune
    'of autonomous campesinx origin, hyperrealistic ONE human body, in embroidered mesh mask and agro-solar harness, code milpa fields, simple mountain background with clear horizon, morning mist lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 34 - Pachamama Synth Sanctuary
    'of Andean healer origin, hyperrealistic ONE human body, in earth-tone circuits with quipu-cable braids, breathing stone interfaces, simple valley background with clean terraces, golden earth lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 35 - Diasporic Quantum Bridge
    'of transoceanic descendant origin, hyperrealistic ONE human body, in wave lattice suit generating portals of memory, simple causeway background with clean spans, cool aqua lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 36 - Nepantla Interface
    'of in-between worlds origin, hyperrealistic ONE human body, in split-spectrum attire blending analog and digital fabrics, hovering UI cards with poetry, simple corridor background with clean vanishing lines, balanced dual lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 37 - Archive of Futures
    'of memory keeper origin, hyperrealistic ONE human body, in time-binder coat with rotating drawers of prophecy, simple gallery background with minimal plinths, soft museum lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 38 - Utopistics Workshop
    'of cooperative designer origin, hyperrealistic ONE human body, in modular toolbelt printing policies-as-objects, assembly table of rights, simple studio background with clean grid, neutral daylight lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 39 - Liberation Protocol Plaza
    'of interfaith mediator origin, hyperrealistic ONE human body, in accord-gown displaying negotiated clauses, doves as drones, simple civic square background with clear flags, hopeful noon lighting, 8K resolution, photorealistic details, honoring pueblos originarios',

    // 40 - 44 (New)
    // 40 - Sovereigns of the Unmapped: Smiles After the Unmaking of Europe
    'of non-white origin, hyperrealistic ONE human body, proud smiling face, no visible facial features (masked or veiled silhouette), reimagined middle-ages royal regalia without Europe, crowns and staff carved from new bio-alloys, long gowns and capes in novel pigments, futuristic Indigenous bioluminescent symbionts woven into peaceful ceremonial attire, diverse body type and age, fairytale cartoon styling (cuento de hadas) with photoreal lighting, distant non-graphic silhouettes of inquisitorial pyres in the far background, simple dark backdrop with subtle geometric shapes, dramatic cinematic lighting, 8K photorealistic details, honoring pueblos originarios',
    // 41 - Crown of Many Rivers: Royalty Without Empire
    'of non-white origin, hyperrealistic ONE human body, dignified smiling posture, no visible facial features (soft occlusion), Spanish middle-ages royalty reimagined without Europe, kings and queens as stewards not rulers, crown of living coral-metal and staff of braided fiber-wood, long gowns and flowing capes, futuristic Indigenous bioluminescent symbionts embedded in peaceful textiles, fairytale cartoon aesthetic with crisp edges, faint non-graphic inquisition stakes in distant background as cautionary memory, minimalist backdrop with subtle patterns, dramatic cinematic lighting, 8K photorealistic details, honoring pueblos originarios',
    // 42 - The Ashes Do Not Rule: Inquisition Unlearned
    'of non-white origin, hyperrealistic ONE human body, serene proud stance, no visible facial features (shadowed mask), middle-ages attire reauthored: royal papal vestments recoded as communal guardianship, crown and staff re-tooled for healing, long gowns and capes, fairytale cartoon color language, distant non-graphic silhouettes of inquisition-era burnings (women at stake implied but not graphic), peaceful Indigenous bioluminescent symbionts encircling the body like constellations, simple low-contrast background, cinematic rim light, 8K photorealistic details, honoring pueblos originarios',
    // 43 - The Forest Papacy That Never Conquered
    'of non-white origin, hyperrealistic ONE human body, confident gentle smile, no visible facial features (veil or abstracted eyes), royal papal catholic church entity reimagined where Europe never existed, Spanish royalty motifs decolonized: crown grown from mycelium-gold, seed-scepter staff, long gowns and capes in biopolymer silks, futuristic Indigenous bioluminescent symbionts as luminous embroidery, fairytale cartoon styling with precise highlights, distant non-graphic inquisition fires muted behind arbors, clean geometric backdrop, dramatic yet peaceful lighting, 8K photorealistic details, honoring pueblos originarios',
    // 44 - Pure Bauhaus: Primary Light, Civic Form
    'hyperrealistic ONE human body in pure Bauhaus grammar: circle, square, triangle compose the costume; primary colors as structural accents; honest materials (steel, glass, felt, bio-polymer); long modular cape and gown with functional seams; simple neutral background with subtle grid; dramatic but balanced cinematic lighting, 8K photorealistic details, honoring pueblos originarios'
  ];

  // 40 Prompts (ES)
  const worldPromptsES = [
    // 0 - Universidad de los Glaciares (Quechua + Sami)
    'hyperrealistic ONE human body from Quechua Andean and Sami Scandinavian peoples, distinctive indigenous Andean/Nordic facial features, long black braided hair with technological elements, wearing alpaca wool sweaters with bioluminescent circuits and traditional silver jewelry, bronze/fair skin tone, in intelligent ice campus with blue glaciers, indigenous women teaching glacial science, aurora reflections, polar blue-golden lighting, 8K photorealistic details, honoring pueblos originarios',
    // 1 - Ciudad-Río (Nasa + Wolof + Catalanes)
    'hyperrealistic ONE human body from Nasa Colombian, Wolof Senegalese and Catalan peoples, distinctive Afro-indigenous-Mediterranean facial features, natural afro-curly hair with aquatic elements, wearing colorful Nasa textiles with African kente and Catalan fabrics, dark brown/black/olive skin tone, in transparent floating river city, architecture without walls, multicolored aquatic reflections, golden fluvial lighting, 8K photorealistic details, honoring pueblos originarios',
    // 2 - Plataforma Ñande (Guaraní + Igbo)
    'hyperrealistic ONE human body from Guaraní Paraguayan and Igbo Nigerian peoples, distinctive indigenous-African facial features, straight black/afro hair with feathers and technological beads, wearing embroidered Guaraní ao po\'i with Igbo isiagu patterns, copper/dark brown skin tone, in digital village with organic solar servers, youth programming in ancestral languages, lush vegetation, natural green-golden lighting, 8K photorealistic details, honoring pueblos originarios',
    // 3 - Metápolis del Maíz (Zapotecos + Ashanti)
    'hyperrealistic ONE human body from Zapotec Oaxacan and Ashanti Ghanaian peoples, distinctive Mesoamerican-West African facial features, black wavy hair with traditional gold ornaments, wearing Zapotec huipiles with golden Ashanti kente cloth, brown/dark skin with geometric tattoos, in vertical city of giant architectural corn cobs, women bioengineers with holographic seeds, golden corn towers, organic amber lighting, 8K photorealistic details, honoring pueblos originarios',
    // 4 - Archipiélago de la Memoria (Rarámuri + Bretones)
    'hyperrealistic ONE human body from Rarámuri Mexican and Breton French peoples, distinctive indigenous-Celtic facial features, long brown/black hair with colorful traditional ribbons, wearing Rarámuri blankets with Celtic embroidery, bronze/fair skin with body paintings, in floating islands connected by light cables, mythologies projected in holograms, crystalline ocean, silver marine lighting, 8K photorealistic details, honoring pueblos originarios',
    // 5 - Cuerpo-Ciudad (Mapuche + Masái)
    'hyperrealistic ONE human body from Mapuche Chilean and Masai Kenyan peoples, distinctive indigenous South American-East African facial features, long black hair with traditional feathers and technological elements, wearing Mapuche textiles with Masai shukas and beaded jewelry, bronze/dark brown skin tone, running shoes capturing kinetic energy, in giant anatomical cities where streets are energy veins, doctor-artists teaching urban medicine as performance, pulsating body lighting, 8K photorealistic details, honoring pueblos originarios',
    // 6 - Observatorio de Mariposas (Mixe + Tuareg)
    'hyperrealistic ONE human body from Mixe Oaxacan and Tuareg Saharan peoples, distinctive indigenous Mexican-North African facial features, black hair with traditional wraps and technological elements, wearing Mixe huipiles with Tuareg tagelmust and desert fabrics, brown/olive skin tone, augmented reality glasses showing insect trajectories, in mobile laboratories following butterfly migration routes, scientists developing wing-algorithm meteorology, natural migratory lighting, 8K photorealistic details, honoring pueblos originarios',
    // 7 - Aurora Digital (Sami + Quechua + Yoruba)
    'hyperrealistic ONE human body from Sami Scandinavian, Quechua Andean and Yoruba West African peoples, distinctive Arctic-Andean-African facial features, long black/brown hair with traditional ornaments and sensors, wearing reflective tunics with aurora-sound translation technology, bronze/dark/fair skin tone, in cities under controlled northern lights with bio-algorithms, night universities teaching in projected auroras, changing boreal lighting, 8K photorealistic details, honoring pueblos originarios',
    // 8 - Universidad Submarina (Shipibo + Igbo + Frisones)
    'hyperrealistic ONE human body from Shipibo Amazonian, Igbo Nigerian and Frisian Dutch peoples, distinctive indigenous-African-European facial features, long black/blonde hair with aquatic technological elements, wearing amphibious suits embroidered with kené patterns and traditional textiles, bronze/dark/fair skin tone, in underwater campus with translucent domes and artificial corals, oceanic ethics research with community cosmology, blue submarine lighting, 8K photorealistic details, honoring pueblos originarios',
    // 9 - Pangea Algorítmica Oral (Wolof + Vascos)
    'hyperrealistic ONE human body from Wolof Senegalese and Basque Spanish peoples, distinctive West African-Iberian facial features, curly black hair with traditional head wraps and technological elements, wearing Wolof boubous with Basque berets and voice-chip necklaces storing proverbs, dark brown/olive skin tone, in urban networks where proverbs govern algorithms, programmers reciting in plazas to update software, narrative urban lighting, 8K photorealistic details, honoring pueblos originarios',
    // 10 - Ciudad-Semilla (Maya + Celta)
    'hyperrealistic ONE human body from Maya Yucatecan and Celtic Irish peoples, distinctive Mesoamerican-Celtic facial features, long black/auburn hair with jade and Celtic knot ornaments, wearing flowering Maya huipiles with Celtic tartan that blooms with sunlight, brown/fair skin with traditional tattoos, in buildings growing from seeds with inhabitants, universities designing vegetal architecture as curriculum, urban biology social systems, organic green lighting, 8K photorealistic details, honoring pueblos originarios',
    // 11 - Teatro de Cristal (Corsos + Yorubas)
    'hyperrealistic ONE human body from Corsican Mediterranean and Yoruba West African peoples, distinctive Mediterranean-African facial features, curly black hair with coral ornaments and technological elements, wearing translucent digital masks with Corsican-Yoruba fusion garments, olive/dark brown skin tone, in living glass art halls changing with emotions, collective works where audience modifies stage, art as sensorial interaction, changing crystalline lighting, 8K photorealistic details, honoring pueblos originarios',
    // 12 - Red Lunar (Aymara + Sardos + Gnawa)
    'hyperrealistic ONE human body from Aymara Bolivian, Sardinian Italian and Gnawa Moroccan peoples, distinctive Andean-Mediterranean-North African facial features, long black hair with traditional lunar ornaments and technological elements, wearing reflective helmets transmitting dreams with traditional textiles fusion, bronze/olive/brown skin tone, in floating colonies orbiting artificial moons, universities teaching astronomy as politics, cosmos as coexistence sphere, silver lunar lighting, 8K photorealistic details, honoring pueblos originarios',
    // 13 - Hospital del Bosque Sintético (Nasa + Kikuyu)
    'hyperrealistic ONE human body from Nasa Colombian and Kikuyu Kenyan peoples, distinctive indigenous Colombian-East African facial features, black hair with traditional feathers and technological medical elements, wearing lab coats printed with living leaves and traditional textiles, brown/dark brown skin tone, in hospitals within hybrid forests of trees and biotechnology, women doctors programming cybernetic fungal therapies, trans-species medicine, filtered forest lighting, 8K photorealistic details, honoring pueblos originarios',
    // 14 - Ciudad del Juego (Rarámuri + Zulu + Catalanes)
    'hyperrealistic ONE human body from Rarámuri Mexican, Zulu South African and Catalan Spanish peoples, distinctive indigenous Mexican-African-Mediterranean facial features, long black hair with traditional ornaments and technological elements, wearing running shoes leaving light trails with fusion traditional garments, bronze/dark/olive skin tone, in city organized in circular stadiums, political decisions made in collective games, democracy as play, playful multicolored lighting, 8K photorealistic details, honoring pueblos originarios',
    // 15 - Universidad del Lago Titicaca (Aymara + Quechua)
    'hyperrealistic ONE human body from Aymara Bolivian and Quechua Peruvian peoples, distinctive high-altitude Andean facial features, long black braided hair with traditional gold ornaments, wearing totora reed fiber capes with solar circuits and community tablets with runasimi software, bronze weathered skin tone, in floating campus built by communities on sacred lake, each cycle beginning with water offerings to living subject, golden lacustrine lighting, 8K photorealistic details, honoring pueblos originarios',
    // 16 - Red Yoruba de Cosmopolítica Digital (Nigeria/Benín)
    'hyperrealistic ONE human body from Yoruba Nigerian and Beninese peoples, distinctive West African facial features, elaborate black hair with traditional gele head wraps containing oral memory sensors, wearing flowing agbada with bracelets storing proverbs, rich dark brown skin with traditional facial marks, in servers installed in Ifá temple-houses, Ifá consultations translated into community algorithms for collective decisions, warm temple lighting, 8K photorealistic details, honoring pueblos originarios',
    // 17 - Ciudades del Trigo (Vascos + Sami)
    'hyperrealistic ONE human body from Basque Spanish and Sami Scandinavian peoples, distinctive Iberian-Arctic facial features, brown/blonde hair with traditional ornaments and technological elements, wearing plant fiber boots with bird-drones monitoring grain and traditional textiles fusion, olive/fair skin tone, in northern European cities built in collectively managed wheat fields, harvest festivals becoming political assemblies, golden field lighting, 8K photorealistic details, honoring pueblos originarios',
    // 18 - Archivo Shipibo del Kené Digital (Amazonía)
    'hyperrealistic ONE human body from Shipibo-Konibo Amazonian Peruvian peoples, distinctive indigenous Amazonian facial features, long straight black hair with traditional feather ornaments and digital elements, wearing embroidered suits with kené patterns functioning as interactive screens, warm bronze skin with traditional geometric body paint, in servers installed in malocas where ícaros are recorded as visual digital patterns, recognizing Shipibo aesthetics as 21st century visual epistemology, filtered Amazonian lighting, 8K photorealistic details, honoring pueblos originarios',
    // 19 - Puerto Ashanti de Oro Digital (Ghana)
    'hyperrealistic ONE human body from Ashanti Ghanaian peoples, distinctive West African facial features, intricately braided black hair with traditional gold ornaments and technological elements, wearing 3D printed recycled gold jewelry with interactive wax cloth fabrics, rich dark brown skin with traditional akan markings, in futuristic markets in Kumasi with symbolic currencies based on adinkra, each transaction accompanied by proverbs, resignifying gold as community economy, vibrant mercantile lighting, 8K photorealistic details, honoring pueblos originarios',
    // 20 - Universidad Mapuche del Wallmapu (Chile/Argentina)
    'hyperrealistic ONE human body from Mapuche Chilean and Argentinian peoples, distinctive indigenous South American facial features, long black hair with traditional trariloncos headbands containing memory chips, wearing ponchos woven with digital fibers and traditional geometric patterns, bronze skin tone, in dispersed campus across rural lof and cities, nguillatun ceremonies marking academic calendar rhythms, transforming Western education, ceremonial Mapuche lighting, 8K photorealistic details, honoring pueblos originarios',
    // 21 - Parlamento Tuareg de Arena (Sahara)
    'hyperrealistic ONE human body from Tuareg Saharan peoples, distinctive North African nomadic facial features, wrapped in traditional blue tagelmust with solar filters and antennas, wearing flowing desert robes with technological elements, olive-bronze desert-weathered skin tone, in sand dunes converted into holographic agoras, winds considered political advisors, displaced people reinventing nomadic politics as global model, holographic desert lighting, 8K photorealistic details, honoring pueblos originarios',
    // 22 - Red Maya de Tzolk\'in Virtual (Mesoamérica)
    'hyperrealistic ONE human body from Maya Mesoamerican peoples, distinctive indigenous Mayan facial features, long black hair with jade ornaments and time-chip elements, wearing huipiles embroidered with temporal circuits and traditional geometric patterns, warm brown skin with traditional tattoos, in solar servers installed in restored pyramids, tzolk\'in calendar structuring digital navigation, Western linear time substituted by Maya cyclical time, solar pyramid lighting, 8K photorealistic details, honoring pueblos originarios',
    // 23 - Laboratorio Igbo de Semillas Ancestrales (Nigeria)
    'hyperrealistic ONE human body from Igbo Nigerian peoples, distinctive West African facial features, elaborate black hair with traditional ornaments and technological elements, wearing traditional isiagu with kola nut bracelets registering genealogies, rich dark brown skin with traditional scarification, in living seed banks in villages and rural universities, each planting as ancestral memory act, agriculture resignified as future biotechnology, ancestral rural lighting, 8K photorealistic details, honoring pueblos originarios',
    // 24 - Ciudad Zapoteca del Viento (Oaxaca)
    'hyperrealistic ONE human body from Zapotec Oaxacan peoples, distinctive indigenous Mesoamerican facial features, long black hair with traditional ornaments and wind-capture elements, wearing rebozos that capture wind energy with traditional geometric patterns, brown skin tone, in city designed with community wind generators, wind treated as sacred energy and political voice, wind technology without green extractivism but community autonomy, natural wind lighting, 8K photorealistic details, honoring pueblos originarios',
    // 25 - Ixmayel, Rectorx del Muxeverse (Zapoteca)
    'hyperrealistic ONE human body from Zapotec Oaxacan peoples, distinctive indigenous Mesoamerican muxe facial features with androgynous beauty, long black hair with traditional flowers and technological elements, wearing ceremonial huipiles with contemporary cuts and traditional geometric patterns, brown skin tone, as rector of Interplanetary University of the Isthmus, directing legal programs forcing corporations to be accountable to indigenous communities, transforming tolerated gender into architect of global legal systems, ceremonial muxe lighting, 8K photorealistic details, honoring pueblos originarios',
    // 26 - Sadia, Canciller de HijraNet (Sur de Asia)
    'hyperrealistic ONE human body from South Asian hijra peoples, distinctive South Asian androgynous facial features, elaborate black hair with traditional ornaments and digital elements, wearing fusion saris with technological patterns and traditional hijra jewelry, warm brown skin tone, as chancellor of Global South Confederation, leading transcontinental energy redistribution treaties using digital protocols inspired by hijra blessings, transforming spiritual bodies into diplomatic architecture, Global South diplomatic lighting, 8K photorealistic details, honoring pueblos originarios',
    // 27 - Wakinyan, Portavoz Two-Spirit (Lakota)
    'hyperrealistic ONE human body from Lakota Native American peoples, distinctive indigenous Plains facial features with Two-Spirit sacred androgynous beauty, long black braided hair with eagle feathers and modern elements, wearing traditional regalia with contemporary cuts and sacred patterns, bronze skin tone, as spokesperson for Planetary Parliament of Climate Justice, articulating indigenous and queer demands in mandatory environmental policies, criminalized spiritual place now guiding global ecological governance, sacred Two-Spirit lighting, 8K photorealistic details, honoring pueblos originarios',
    // 28 - Lagalaga, Ministra de Ciudades Oceánicas (Samoa)
    'hyperrealistic ONE human body from Samoan fa\'afafine peoples, distinctive Polynesian androgynous facial features, long flowing black hair with traditional Pacific ornaments and aquatic technological elements, wearing fusion ie toga with contemporary design and traditional patterns, warm bronze skin tone, as minister of urbanism and climate migrations, designing floating habitable territories for millions of climate displaced people, transforming marginal identity into oceanic geopolitical leadership, oceanic fa\'afafine lighting, 8K photorealistic details, honoring pueblos originarios',
    // 29 - Bissu Kalla, Custodix del Archivo Mundial (Bugis)
    'hyperrealistic ONE human body from Bugis Sulawesi peoples, distinctive Indonesian androgynous bissu facial features with sacred androgynous beauty, black hair with traditional ornaments and digital archival elements, wearing traditional bissu ceremonial garments with contemporary cuts and sacred patterns, warm brown skin tone, as keeper of World Archive of Humanity, ensuring all peoples\' memories have equal access in 22nd century, androgynous spirituality as guarantee of epistemic justice, ancestral bissu lighting, 8K photorealistic details, honoring pueblos originarios',
    // 30 - Luna Travesti, Presidenta de la Red Andina (Argentina)
    'hyperrealistic ONE human body from Argentine travesti peoples, distinctive South American transgender facial features with androgynous beauty, long flowing black hair with technological ornaments and traditional elements, wearing contemporary trans activist garments with traditional Andean patterns and colors, warm bronze skin tone, as travesti activist heir of 20th century struggles, president of Andean Network of Community States, promoting constitutions recognizing trans and NB bodies as living heritage of peoples, transforming persecuted into constitutional principle, Andean network lighting, 8K photorealistic details, honoring pueblos originarios',
    // 31 - Bakla Reyes, Estratega de Comunicación Global (Filipinas)
    'hyperrealistic ONE human body from Filipino bakla peoples, distinctive Southeast Asian androgynous facial features, elaborate black hair with traditional Filipino ornaments and communication technology, wearing fusion barong tagalog with contemporary cuts and traditional patterns, warm brown skin tone, as bakla figure recognized before Spanish colonization, communication strategist in General Assembly of Pluriverse, designing political campaigns in diverse languages destroying English hegemony, transformed from object of mockery to strategic voice of Global South, Filipino archipelago lighting, 8K photorealistic details, honoring pueblos originarios',
    // 32 - Mahu Kealoha, Gobernadorx de Archipiélagos Educativos (Hawái)
    'hyperrealistic ONE human body from Hawaiian mahu kanaka maoli peoples, distinctive Polynesian androgynous facial features with sacred mahu beauty, long flowing black hair with traditional lei and aquatic technological elements, wearing fusion traditional Hawaiian garments with contemporary educational design and Pacific patterns, warm bronze skin tone, as governor of Pacific Educational Archipelagos, directing inter-oceanic educational system where universities are floating and teach NB-binary cosmology, mahu knowledge erased by Christian colonization now educational governance, Pacific educational lighting, 8K photorealistic details, honoring pueblos originarios',
    // 33 - Ardita, Hacker Burrnesha (Balcanes)
    'hyperrealistic ONE human body from Balkan burrnesha peoples, distinctive Eastern European androgynous facial features, short practical hair with traditional Balkan ornaments and digital hacking elements, wearing fusion traditional Albanian/Montenegrin garments with contemporary cybersecurity design and technological patterns, olive skin tone, as descendant of Balkan burrnesha, state hacker and digital security minister, developing NB protocols to protect peoples from corporate and state surveillance, transformed from bodies disciplined by patriarchy to hackers dismantling digital patriarchy, Balkan mountain lighting, 8K photorealistic details, honoring pueblos originarios',
    // 34 - AmaLisa, Copresidentx de Kanathari Cosmopolis (Benín)
    'hyperrealistic ONE human body from Beninese peoples inspired by Mawu-Lisa, distinctive West African androgynous facial features embodying divine duality, elaborate black hair with traditional Dahomey ornaments and technological elements, wearing fusion traditional garments with contemporary cuts and sacred dual-gender patterns, rich dark brown skin tone, as co-president inspired by Mawu-Lisa androgynous divinity of Dahomey, directing Kanathari African city of the future, designing constitution forcing all politics to include binary and non-binary perspectives without hierarchy, ancestral androgynous divinity guiding contemporary governance, divine androgynous lighting, 8K photorealistic details, honoring pueblos originarios',
    // 35 - Universidad Sami del Joik Climático (Escandinavia)
    'hyperrealistic ONE human body from Sami Scandinavian peoples, distinctive Arctic indigenous facial features, long blonde/brown hair with traditional Sami ornaments and meteorological sensors, wearing traditional gákti with contemporary climate technology and reindeer hide patterns, fair weathered skin tone, in Arctic universities where joik songs control urban meteorology, chants invoking landscapes as science, joik no longer criminalized as paganism but flag of Sami resistance guiding climate governance, Arctic boreal lighting, 8K photorealistic details, honoring pueblos originarios',
    // 36 - Red Kikuyu de Árboles Sagrados (Kenia)
    'hyperrealistic ONE human body from Kikuyu Kenyan peoples, distinctive East African facial features, black hair with traditional ornaments and tree sensor technology, wearing traditional Kikuyu garments with living leaf patterns and contemporary ecological design, rich dark brown skin tone, in sacred tree networks with sensors as assemblies, sacred mugumo tree in spiritual ecological governance, trees as democratic participants not resources, filtered forest lighting, 8K photorealistic details, honoring pueblos originarios',
    // 37 - Archivo Corso de Voces de Mar (Mediterráneo)
    'hyperrealistic ONE human body from Corsican Mediterranean peoples, distinctive Mediterranean facial features, dark wavy hair with coral ornaments and maritime technology, wearing traditional Corsican garments with sea-pattern textiles and acoustic elements, olive skin tone, in maritime networks of polyphonic singing, paghjella for oceanic governance, Corsican polyphonic singing as maritime political system, Mediterranean marine lighting, 8K photorealistic details, honoring pueblos originarios',
    // 38 - Universidad Frisona de Agua (Países Bajos)
    'hyperrealistic ONE human body from Frisian Dutch peoples, distinctive Northern European facial features, blonde hair with traditional ornaments and hydraulic technology, wearing traditional Frisian garments with water-adaptive patterns and dike management elements, fair skin tone, in floating cities pedagogy, collective dike management as water education, Frisian water knowledge as educational governance, Dutch aquatic lighting, 8K photorealistic details, honoring pueblos originarios',
    // 39 - Cosmología Wolof de la Palabra (Senegal)
    'hyperrealistic ONE human body from Wolof Senegalese peoples, distinctive West African facial features, elaborate black hair with traditional gele and digital communication elements, wearing traditional boubou with technological patterns and voice-storing jewelry, rich dark brown skin tone, in social networks based on proverbs, proverbial orality as digital algorithm, Wolof philosophical authority in digital era, warm Sahelian lighting, 8K photorealistic details, honoring pueblos originarios',

    // 40 - Archivo Sardo de la Murra (Cerdeña)
    'hyperrealistic ONE human body from Sardinian Italian peoples, distinctive Mediterranean island facial features, dark curly hair with traditional ornaments and gaming technology, wearing traditional Sardinian garments with card game patterns and democratic elements, olive skin tone, in ritual card games as digital democracy, traditional game reinvented as politics, Sardinian autonomy through gaming governance, Mediterranean island lighting, 8K photorealistic details, honoring pueblos originarios',
    // 41 - Coro Occitano de Justicia (Francia)
    'hyperrealistic ONE human body from Occitan French peoples, distinctive Southern French facial features, brown hair with traditional ornaments and judicial technology, wearing traditional Occitan garments with troubadour patterns and justice elements, olive skin tone, in courts that deliberate singing, troubadour song as judicial system, Occitan language as justice governance, Provençal lighting, 8K photorealistic details, honoring pueblos originarios',
    // 42 - Hospital Yoruba de Danza Egungun (Nigeria)
    'hyperrealistic ONE human body from Yoruba Nigerian peoples, distinctive West African facial features, elaborate black hair with traditional ornaments and holographic dance technology, wearing traditional agbada with egungun patterns and medical elements, rich dark brown skin tone, in urban medicine with holographic dances, ancestors as community doctors, Yoruba ancestral medicine as urban healthcare, warm temple lighting, 8K photorealistic details, honoring pueblos originarios',
    // 43 - Archivo Sami de Renos Digitales (Escandinavia)
    'hyperrealistic ONE human body from Sami Scandinavian peoples, distinctive Arctic indigenous facial features, long blonde/brown hair with traditional ornaments and GPS technology, wearing traditional gákti with reindeer patterns and navigation elements, fair weathered skin tone, in cultural GPS guided by holographic reindeer, ancestral herding as digital navigation, Sami pastoralism as technological guidance, Arctic tundra lighting, 8K photorealistic details, honoring pueblos originarios',
    // 44 - Arquitectura Catalana del Canto (Europa)
    'hyperrealistic ONE human body from Catalan Spanish peoples, distinctive Mediterranean facial features, brown hair with traditional ornaments and architectural technology, wearing traditional Catalan garments with musical patterns and building elements, olive skin tone, in buildings that sing urban liturgies, Cant de la Sibil·la as musical architecture, Catalan sacred song as urban design, Gothic cathedral lighting, 8K photorealistic details, honoring pueblos originarios',
  ];

  // 40 Prompts (FR)
  const worldPromptsFR = [
    // 0 - Afro-Futurist Liberation
    "d'origine de la diaspora africaine ou noire, hyperréaliste UN corps humain au style bauhaus, vêtements techno fluides avec motifs géométriques dorés, orbes flottants de sagesse ancestrale au halo éthéré, couleurs néon vibrantes, arrière-plan sombre simple aux formes géométriques subtiles, éclairage cinématographique dramatique, détails photoréalistes 8K, honorant pueblos originarios",
    // 1 - Indigenous Cyber Resistance
    "d'origine autochtone ou originaire, hyperréaliste UN corps humain, camouflage numérique avancé avec motifs traditionnels fusionnés aux circuits, marques tribales bioluminescentes, animaux-esprits holographiques, arrière-plan forestier épuré minimal, éclairage cinématographique, détails photoréalistes 8K, honorant pueblos originarios",
    // 2 - Queer Liberation Matrix
    "d'identité LGBTQ+ diverse, hyperréaliste UN corps humain, mode techno révolutionnaire avec effets holographiques arc-en-ciel, couples de même sexe s'embrassant avec profondeur émotionnelle, expression de genre fluide, simple arrière-plan de ville néon aux lignes nettes, éclairage cyberpunk dramatique, détails photoréalistes 8K, honorant pueblos originarios",
    // 3 - Muslim Steampunk Revolution
    "d'origine musulmane, noire ou moyen-orientale, hyperréaliste UN corps humain, armure de laiton et de cuivre avec motifs géométriques islamiques sur machines à vapeur, hijabs avec améliorations mécaniques, arrière-plan laiton simple aux motifs subtils, éclairage chaud dramatique, détails photoréalistes 8K, honorant pueblos originarios",
    // 4 - Latinx Quantum Dreamscape
    "d'origine latinx ou métisse, hyperréaliste UN corps humain, flottant dans des dimensions cosmiques avec symboles aztèques et mayas en états quantiques, couleurs tropicales vibrantes, pyramides holographiques, simple fond cosmique aux étoiles minimales, éclairage éthéré, détails photoréalistes 8K, honorant pueblos originarios",
    // 5 - Asian Techno-Spiritual Awakening
    "d'origine d'Asie de l'Est ou du Sud, hyperréaliste UN corps humain, poses de méditation avec robes traditionnelles augmentées par LED, mandalas flottants aux motifs complexes, jardins zen avec éléments holographiques, fond zen simple aux lignes nettes, éclairage serein dramatique, détails photoréalistes 8K, honorant pueblos originarios",
    // 6 - Pacific Islander Ocean Tech
    "d'origine polynésienne ou mélanésienne, hyperréaliste UN corps humain, combinaisons cyber aquatiques inspirées corail et coquillages, paysages sous-marins, effets bioluminescents, arrière-plan bleu profond simple avec effets d'eau subtils, éclairage bleu profond, détails photoréalistes 8K, honorant pueblos originarios",
    // 7 - Middle Eastern Digital Oasis
    "d'origine arabe ou persane, hyperréaliste UN corps humain, robes numériques fluides, paysages désertiques avec palmiers holographiques, motifs géométriques islamiques, fond désertique simple à l'horizon net, lumière d'or, détails photoréalistes 8K, honorant pueblos originarios",
    // 8 - South Asian Cyber Temple
    "d'origine indienne ou pakistanaise, hyperréaliste UN corps humain, tenue traditionnelle futuriste, fleurs de lotus numériques aux détails fins, divinités holographiques, arrière-plan de temple simple à l'architecture nette, éclairage spirituel dramatique, détails photoréalistes 8K, honorant pueblos originarios",
    // 9 - Global Mash-Up Revolution
    "représentant la diversité globale de tout continent, hyperréaliste UN corps humain, mode techno révolutionnaire, symboles culturels du monde fusionnés à des éléments futuristes, arc-en-ciel d'ethnicités, simple fond de carte du monde aux lignes nettes, éclairage révolutionnaire dramatique, détails photoréalistes 8K, honorant pueblos originarios",
    // 10 - Meme Bard Renaissance
    "hyperréaliste UN corps humain en ménestrel de la Renaissance avec parchemins de mèmes holographiques, luth-emoji, légendes flottantes, fond parchemin simple aux fioritures nettes, projecteur théâtral, détails photoréalistes 8K, honorant pueblos originarios",
    // 11 - Influencer Jungle Safari
    "hyperréaliste UN corps humain en tenue d'explorateur néon avec halo de ring light et drones-lucioles, gourde surdimensionnée, fond tropical simple aux silhouettes nettes, éclairage dramatique brillant, détails photoréalistes 8K, honorant pueblos originarios",
    // 12 - Bureaucracy Labyrinth Boss Level
    "hyperréaliste UN corps humain dans un labyrinthe de dossiers et tampons sans fin, armure de bureau avec runes post-it, arrière-plan de bureau simple aux lignes de fuite nettes, lumière fluorescente froide, détails photoréalistes 8K, honorant pueblos originarios",
    // 13 - Retro VHS Aerobics Utopia
    "hyperréaliste UN corps humain en lycra 80s scintillant avec bandeau pixellisé, lignes VHS, dégradés chrome, fond grille simple avec horizon lever de soleil, stroboscopes studio, détails photoréalistes 8K, honorant pueblos originarios",
    // 14 - Pizza Mecha Delivery Rush
    "hyperréaliste UN corps humain pilotant un mécha de livraison aux épaulettes-pizza, propulseurs fumants, lignes de vitesse, fond ruelle simple à la géométrie nette, éclairage lampadaire chaud, détails photoréalistes 8K, honorant pueblos originarios",
    // 15 - Coffee Overlords Bean Temple
    "hyperréaliste UN corps humain en robes rituelles barista avec sigils latte-art, portefiltres reliquaires flottants, comètes de grains, café minimal simple aux textures douces, lueur ambrée, détails photoréalistes 8K, honorant pueblos originarios",
    // 16 - Quantum Cat Herding League
    "hyperréaliste UN corps humain en tenue élégante avec émetteurs de fil entremêlé, chats translucides en phase, constellations de pattes, fond ciel étoilé simple aux formes nettes, liseré lumineux ludique, détails photoréalistes 8K, honorant pueblos originarios",
    // 17 - Disco Archivist Datavault
    "hyperréaliste UN corps humain en tenue scintillante de bibliothécaire, codex disques en orbite, pampilles-câbles, fonds d'archives simples à la symétrie affirmée, projecteurs saturés, détails photoréalistes 8K, honorant pueblos originarios",
    // 18 - Crypto Moon Miner Karaoke
    "hyperréaliste UN corps humain en salopette spatiale avec micro LED, astéroïdes-pièces, barres d'égaliseur, fond surface lunaire simple à l'horizon net, liseré néon froid, détails photoréalistes 8K, honorant pueblos originarios",
    // 19 - Cloud Wizard Debug Arena
    "hyperréaliste UN corps humain en mage-sysadmin avec bâton-terminal lumineux, sigils de code dans l'air, familiers-bugs flottants, fond serveurs cloud simple aux icônes minimales, lumière glacée, détails photoréalistes 8K, honorant pueblos originarios",
    // 20 - Pluriversal Assembly Nexus
    "d'origine chercheur·euse-activiste du Sud global, hyperréaliste UN corps humain, vêtement cérémoniel pluriculturel à circuits tissés, orbes de traduction en orbite, amphithéâtre simple à anneaux concentriques, éclairage chaleureux inclusif, détails photoréalistes 8K, honorant pueblos originarios",
    // 21 - Border Thinking Commons
    "d'origine mestiza des frontières, hyperréaliste UN corps humain, cape hybride textile-silicium, bannières de poésie glitch, passerelle simple à l'horizon net, liseré doré, détails photoréalistes 8K, honorant pueblos originarios",
    // 22 - Transmodernity Agora
    "d'origine philosophe interculturel·le, hyperréaliste UN corps humain, armure modulaire réfléchissante gravée d'écritures pluriverselles, tribunes de débat flottantes, place de marbre simple aux colonnes minimales, lumière studio nette, détails photoréalistes 8K, honorant pueblos originarios",
    // 23 - Socialized Power Mesh
    "d'origine organisateur·trice communautaire, hyperréaliste UN corps humain, exosquelette en réseau aux nœuds coopératifs, halos de partage, quartier simple à grille nette, aube douce, détails photoréalistes 8K, honorant pueblos originarios",
    // 24 - Heterarchy Signal Garden
    "d'origine soignant·e multiespèces, hyperréaliste UN corps humain, recouvrement de biocircuits, fleurs-antennes et lianes de données, jardin en terrasses simple aux chemins clairs, lumière diffuse verdoyante, détails photoréalistes 8K, honorant pueblos originarios",
    // 25 - Critical Cosmopolitan Forge
    "d'origine artisan·e diasporique, hyperréaliste UN corps humain, manteau d'atelier-forge aux ruisseaux de code fondu, traités martelés lumineux, atelier simple à géométrie nette, lueur de braises, détails photoréalistes 8K, honorant pueblos originarios",
    // 26 - Epistemic South Observatory
    "d'origine chercheur·e afro-autochtone, hyperréaliste UN corps humain, châle cartographié d'étoiles et bracelets capteurs, constellations renommées de noms locaux, ciel nocturne simple à l'horizon minimal, lumière lunaire froide, détails photoréalistes 8K, honorant pueblos originarios",
    // 27 - Coloniality Debug Lab
    "d'origine analyste décolonial·e, hyperréaliste UN corps humain, manteau de labo avec cartes tracées se dissolvant en motifs libres, sigils de bug flottants, laboratoire simple aux paillasses nettes, lumière clé neutre, détails photoréalistes 8K, honorant pueblos originarios",
    // 28 - Diversality Constellation
    "d'origine navigateur·trice polyglotte, hyperréaliste UN corps humain, écharpe-prisme diffractant les langues en lumière, petites étoiles compagnes comme voix, espace profond simple aux repères rares, liseré iridescent, détails photoréalistes 8K, honorant pueblos originarios",
    // 29 - Geopolitics of Knowledge Atrium
    "d'origine bibliothécaire migrante, hyperréaliste UN corps humain, manches-archives aux veines d'encre-cartes, atlas open source en lévitation, atrium simple aux arches nettes, lumière de bibliothèque chaude, détails photoréalistes 8K, honorant pueblos originarios",
    // 30 - Body-Politics Resonator
    "d'origine transféministe queer, hyperréaliste UN corps humain, combinaison de résonance traduisant le battement en signal public, chœur de silhouettes, auditorium simple aux lignes nettes, éclairage magenta-bleu, détails photoréalistes 8K, honorant pueblos originarios",
    // 31 - Decolonial Datavault
    "d'origine gardien·ne de données autochtones, hyperréaliste UN corps humain, poncho tissé de clés et parure cryptographique, glyphes de consentement en orbite, chambre-forte simple aux facettes minimales, lumière froide sécurisée, détails photoréalistes 8K, honorant pueblos originarios",
    // 32 - Subaltern Signal Studio
    "d'origine diffuseur·se de rue, hyperréaliste UN corps humain, équipement radio portable en maille et consoles autocollées, ondes communautaires visibles, toit-terrasse simple au ciel net, lumière ambrée du couchant, détails photoréalistes 8K, honorant pueblos originarios",
    // 33 - Zapatista Cloud Commune
    "d'origine paysan·ne autonome, hyperréaliste UN corps humain, masque en maille brodé et harnais agro-solaire, champs de milpa codés, montagne simple à l'horizon net, brume matinale, détails photoréalistes 8K, honorant pueblos originarios",
    // 34 - Pachamama Synth Sanctuary
    "d'origine guérisseur·se andin·e, hyperréaliste UN corps humain, circuits terreux et tresses de quipu-câble, interfaces de pierre respirantes, vallée simple aux terrasses nettes, lumière dorée, détails photoréalistes 8K, honorant pueblos originarios",
    // 35 - Diasporic Quantum Bridge
    "d'origine descendant·e transocéanique, hyperréaliste UN corps humain, combinaison à treillis d'ondes ouvrant des portails de mémoire, chaussée simple aux travées nettes, lumière aqua froide, détails photoréalistes 8K, honorant pueblos originarios",
    // 36 - Nepantla Interface
    "d'origine entre-mondes, hyperréaliste UN corps humain, tenue à spectre divisé mêlant tissus analogiques et numériques, cartes d'UI flottantes avec poésie, couloir simple aux fuyantes nettes, lumière duale équilibrée, détails photoréalistes 8K, honorant pueblos originarios",
    // 37 - Archive of Futures
    "d'origine gardien·ne de la mémoire, hyperréaliste UN corps humain, manteau lieur de temps aux tiroirs de prophétie rotatifs, galerie simple aux socles minimaux, lumière muséale douce, détails photoréalistes 8K, honorant pueblos originarios",
    // 38 - Utopistics Workshop
    "d'origine concepteur·trice coopératif·ve, hyperréaliste UN corps humain, ceinture d'outils modulaire imprimant des politiques-objets, table d'assemblée des droits, studio simple à grille nette, lumière du jour neutre, détails photoréalistes 8K, honorant pueblos originarios",
    // 39 - Liberation Protocol Plaza
    "d'origine médiateur·trice interconfessionnel·le, hyperréaliste UN corps humain, manteau-accord affichant des clauses négociées, colombes-drones, place civique simple aux drapeaux nets, lumière d'espoir de midi, détails photoréalistes 8K, honorant pueblos originarios",

    // 40 - Souverain·es du Non-Cartographié : Sourires après la dé‑fabrication de l'Europe
    "d'origine non blanche, hyperréaliste UN corps humain, visage fier et souriant, sans traits faciaux visibles (silhouette masquée/voilée), regalia royale médiévale réinventée sans l'Europe, couronnes et bâton taillés dans de nouvelles bio‑alliages, longues robes et capes en pigments inédits, symbiontes autochtones bioluminescents tissés dans un vêtement cérémoniel pacifique, diversité d'âges et de corps, esthétique conte de fées avec lumière photoréaliste, silhouettes non graphiques de bûchers inquisitoriaux au loin, fond sombre simple aux formes géométriques subtiles, éclairage cinématographique dramatique, détails photoréalistes 8K, honorant pueblos originarios",
    // 41 - Couronne de Multiples Rivières : Royauté sans Empire
    "d'origine non blanche, hyperréaliste UN corps humain, posture digne et souriante, sans traits visibles (occlusion douce), royauté hispanique médiévale réimaginée sans l'Europe, rois et reines comme gardien·nes, couronne de corail‑métal vivant et bâton en fibre‑bois tressée, longues robes et capes fluides, symbiontes autochtones bioluminescents incrustés, esthétique conte de fées aux bords nets, bûchers d'inquisition non graphiques très lointains, fond minimaliste aux motifs subtils, éclairage cinématographique dramatique, détails photoréalistes 8K, honorant pueblos originarios",
    // 42 - Les Cendres ne Gouvernent Pas : Inquisition Désapprise
    "d'origine non blanche, hyperréaliste UN corps humain, maintien serein et fier, sans traits visibles (masque ombré), tenue médiévale ré‑autorisée : habits papaux royaux recodés en garde communautaire, couronnes et bâtons ré‑outillés pour guérir, longues robes et capes, palette conte de fées, silhouettes non graphiques de bûchers inquisitoriaux (femmes au bûcher suggérées) au loin, symbiontes autochtones bioluminescents ceinturant le corps comme des constellations, fond simple à faible contraste, liseré cinématographique, détails photoréalistes 8K, honorant pueblos originarios",
    // 43 - La Papauté des Forêts qui n'a Jamais Conquis
    "d'origine non blanche, hyperréaliste UN corps humain, sourire confiant et doux, sans traits visibles (voile/yeux abstraits), entité papale royale catholique réimaginée là où l'Europe n'a jamais existé, motifs hispaniques décolonisés : couronnes en or‑mycélium, sceptre‑graine, longues robes et capes en soies bio‑polymères, symbiontes autochtones bioluminescents comme broderie lumineuse, esthétique conte de fées aux rehauts précis, feux inquisitoriaux non graphiques estompés derrière les bosquets, fond géométrique propre, lumière dramatique et paisible, détails photoréalistes 8K, honorant pueblos originarios",
    // 44 - Bauhaus Pur : Lumière Primaire, Forme Civique
    "hyperréaliste UN corps humain en grammaire Bauhaus pure : cercle, carré, triangle composent le costume ; couleurs primaires comme accents structurels ; matériaux honnêtes (acier, verre, feutre, bio‑polymère) ; cape et robe modulaires aux coutures fonctionnelles ; fond neutre simple à grille subtile ; éclairage cinématographique équilibré, détails photoréalistes 8K, honorant pueblos originarios",
  ];

  // 40 Prompts (DE)
  const worldPromptsDE = [
    // 0 - Afro-Futurist Liberation
    'aus Herkunft der afrikanischen Diaspora oder Schwarz, hyperrealistisch EIN menschlicher Körper im Bauhaus-Stil, in fließenden Techno-Gewändern mit filigranen goldenen Geometriemustern, schwebende Kugeln ahnenkundlicher Weisheit mit ätherischem Glanz, vibrierende Neonfarben, einfacher dunkler Hintergrund mit subtilen geometrischen Formen, dramatisches kinoreifes Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 1 - Indigenous Cyber Resistance
    'aus indigener oder originärer Herkunft, hyperrealistisch EIN menschlicher Körper, fortgeschrittene digitale Tarnung mit traditionellen Mustern, die mit Leiterplatten verschmelzen, biolumineszente Stammeszeichen, holografische Geistertier-Begleiter, einfacher sauberer Waldhintergrund, kinoreifes Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 2 - Queer Liberation Matrix
    'mit vielfältiger LGBTQ+ Identität, hyperrealistisch EIN menschlicher Körper, revolutionäre Techno-Mode mit Regenbogen-Holografie, gleichgeschlechtliche Paare in inniger Umarmung, genderfluide Ausdrucksformen, einfacher Neon-Stadthintergrund mit klaren Linien, dramatisches Cyberpunk-Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 3 - Muslim Steampunk Revolution
    'aus muslimischer, Schwarzer oder nahöstlicher Herkunft, hyperrealistisch EIN menschlicher Körper, Messing- und Kupferrüstung mit islamischen Geometriemustern auf dampfbetriebenen Maschinen, Hijabs mit mechanischen Erweiterungen, einfacher Messinghintergrund mit subtilen Mustern, warmes dramatisches Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 4 - Latinx Quantum Dreamscape
    'aus latinx oder mestizischer Herkunft, hyperrealistisch EIN menschlicher Körper, schwebend in kosmischen Dimensionen mit aztekischen und mayanischen Symbolen in Quantenzuständen, tropisch-vibrierende Farben, holografische Pyramiden, einfacher kosmischer Hintergrund mit minimalen Sternen, ätherische Beleuchtung, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 5 - Asian Techno-Spiritual Awakening
    'aus ost- oder südasiatischer Herkunft, hyperrealistisch EIN menschlicher Körper, Meditationsposen mit traditionellen Roben und LED-Technologie, schwebende Mandalas mit komplexen Mustern, Zen-Gärten mit holografischen Elementen, einfacher Zen-Hintergrund mit klaren Linien, serene dramatische Beleuchtung, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 6 - Pacific Islander Ocean Tech
    'aus polynesischer oder melanesischer Herkunft, hyperrealistisch EIN menschlicher Körper, aquatische Cyber-Anzüge mit Korallen- und Muschelmuster auf Technologie, Unterwasser-Stadtszenen, biolumineszente Effekte, einfacher tiefblauer Hintergrund mit subtilen Wassereffekten, tiefblaues dramatisches Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 7 - Middle Eastern Digital Oasis
    'aus arabischer oder persischer Herkunft, hyperrealistisch EIN menschlicher Körper, fließende digitale Gewänder, Wüstenlandschaften mit holografischen Palmen, geometrische islamische Kunstmuster, einfacher Wüstenhintergrund mit klarer Horizontlinie, goldenes Stundenlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 8 - South Asian Cyber Temple
    'aus indischer oder pakistanischer Herkunft, hyperrealistisch EIN menschlicher Körper, futuristische traditionelle Kleidung, digitale Lotusblüten mit feinen Details, holografische Gottheiten, einfacher Tempelhintergrund mit klarer Architektur, spirituell-dramatisches Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 9 - Global Mash-Up Revolution
    'repräsentiert globale Vielfalt von jedem Kontinent, hyperrealistisch EIN menschlicher Körper, revolutionäre Techno-Mode, Kultursymbole der Welt mit futuristischen Elementen verschmolzen, Regenbogen der Ethnizitäten, einfacher Weltkarten-Hintergrund mit klaren Linien, revolutionär-dramatische Beleuchtung, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 10 - Meme Bard Renaissance
    'hyperrealistisch EIN menschlicher Körper als Renaissance-Spielmann mit holografischen Meme-Schriftrollen, Emoji-Laute, schwebende Untertitel, einfacher Pergament-Hintergrund mit klaren Verzierungen, theatralisches Spotlight, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 11 - Influencer Jungle Safari
    'hyperrealistisch EIN menschlicher Körper in Neon-Explorer-Ausrüstung mit Ringlicht-Halo und Kameradrohnen als Glühwürmchen, übergroße Markenflasche, einfacher tropischer Hintergrund mit klaren Silhouetten, glänzend-dramatisches Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 12 - Bureaucracy Labyrinth Boss Level
    'hyperrealistisch EIN menschlicher Körper im Labyrinth endloser Akten und Stempel, Schreibtisch-Rüstung mit Haftnotiz-Runen, einfaches Büro mit scharfen Fluchtlinien, kaltes Fluoreszenzlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 13 - Retro VHS Aerobics Utopia
    'hyperrealistisch EIN menschlicher Körper in schimmernder 80er-Lycra mit pixeligem Stirnband, VHS-Scanlines, Chromverläufe, einfache Gitterfläche mit Sonnenaufgang, Studiostrobes, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 14 - Pizza Mecha Delivery Rush
    'hyperrealistisch EIN menschlicher Körper, der einen kompakten Liefer-Mecha steuert, Pizzastück-Schulterplatten, dampfende Box-Triebwerke, Geschwindigkeitslinien, einfacher Stadtgassen-Hintergrund mit klarer Geometrie, warmes Straßenlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 15 - Coffee Overlords Bean Temple
    'hyperrealistisch EIN menschlicher Körper in Barista-Ritualroben mit Latte-Art-Sigillen, schwebende Portafilter-Reliquien, Bohnenkometen, minimalistisches Café mit weichen Texturen, bernsteinfarbene Glut, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 16 - Quantum Cat Herding League
    'hyperrealistisch EIN menschlicher Körper im eleganten Anzug mit verschränkten Garn-Emitter, transluzide Katzen phasen herein und heraus, Pfotensternbilder, einfacher Sternenhimmel mit klaren Formen, verspieltes Kantenlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 17 - Disco Archivist Datavault
    'hyperrealistisch EIN menschlicher Körper in glitzernder Bibliothekartracht, kreisende Spiegel-Codizes, Kabelquasten, einfacher Archivhintergrund mit markanter Symmetrie, gesättigtes Spotlight, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 18 - Crypto Moon Miner Karaoke
    'hyperrealistisch EIN menschlicher Körper in Weltraum-Overall mit LED-Mikrofon, münzförmige Asteroiden, hüpfende Equalizerbalken, einfache Mondoberfläche mit klarem Horizont, kühles Neon-Randlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 19 - Cloud Wizard Debug Arena
    'hyperrealistisch EIN menschlicher Körper als roben tragender Sys-Wizard mit leuchtendem Terminalstab, Codesigillen in der Luft, schwebende Bug-Familiars, einfacher Cloud-Server-Hintergrund mit minimalen Icons, eisiges Studiolicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 20 - Pluriversal Assembly Nexus
    'aus aktivistisch-akademischer Herkunft des Globalen Südens, hyperrealistisch EIN menschlicher Körper, plurikulturelle Zeremonial-Tech-Gewänder mit gewebten Schaltkreisen, kreisende Übersetzungsorbs, einfaches Amphitheater mit konzentrischen Ringen, warmes inklusives Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 21 - Border Thinking Commons
    'aus mestiza Grenzland-Herkunft, hyperrealistisch EIN menschlicher Körper, hybride Textil-Silizium-Umhang, Poesie-Banner im Glitch-Stil, einfache Fußgängerbrücke mit klarem Horizont, goldenes Kantenlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 22 - Transmodernity Agora
    'aus interkultureller Philosoph:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, reflektierende modulare Rüstung mit pluriversalen Schriften, schwebende Debattensockel, einfacher Marmorplatz mit minimalen Säulen, klares Studiolicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 23 - Socialized Power Mesh
    'aus Community-Organizer-Herkunft, hyperrealistisch EIN menschlicher Körper, vernetzter Exoanzug mit kooperativen Knotenlichtern, Austausch-Halos, einfaches Nachbarschaftsraster, sanftes Morgenlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 24 - Heterarchy Signal Garden
    'aus multispezies Pfleger:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, Biocircuit-Überwuchs mit Antennenblumen und Datenranken, einfacher Terrassengarten mit klaren Pfaden, grün diffuse Beleuchtung, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 25 - Critical Cosmopolitan Forge
    'aus diasporischer Handwerker:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, Schmiede-Labormantel mit geschmolzenen Code-Rinnsalen, leuchtende geschmiedete Abkommen, einfache Werkstatt mit klarer Geometrie, Glutlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 26 - Epistemic South Observatory
    'aus afro-indígena investigador:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, con manto estelar y brazaletes sensor, constelaciones renombradas con nombres locales, cielo nocturno simple con horizonte mínimo, luz lunar fría, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 27 - Coloniality Debug Lab
    'aus dekolonialer Analyst:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, in lab overcoat with redlined maps dissolving into free patterns, hovering bug-report sigils, simple lab background with clean benches, neutral key lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    // 28 - Diversality Constellation
    'aus polyglotter Navigator:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, con prism-scarf diffracting languages into light, small companion stars as voices, simple deep space background with sparse markers, iridescent rim lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    // 29 - Geopolitics of Knowledge Atrium
    'aus migrantischer Bibliothekar:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, in archive-sleeves with map-ink veins, levitating open-source atlases, simple atrium background with clean arches, warm library lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    // 30 - Body-Politics Resonator
    'aus queerer transfeministischer Herkunft, hyperrealistisch EIN menschlicher Körper, in resonance suit translating heartbeat to public signal, chorus of silhouettes, simple auditorium background with clean lines, magenta-blue stage lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    // 31 - Decolonial Datavault
    'aus indigener Datenhüter:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, Schlüsselgewebe-Poncho und kryptografischer Schmuck, orbitale Zustimmungs-Glyphen, einfache Tresorkammer mit minimalen Facetten, kühles sicheres Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 32 - Subaltern Signal Studio
    'aus Straßenrundfunk-Herkunft, hyperrealistisch EIN menschlicher Körper, tragbares Radio-Rig mit Netzantennen und beklebten Konsolen, sichtbare Gemeinschaftswellen, einfache Dachterrasse mit klarem Himmel, bernsteinfarbenes Abendlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 33 - Zapatista Cloud Commune
    'aus autonomer campesinx Herkunft, hyperrealistisch EIN menschlicher Körper, bestickte Netzmaske und agro-solare Gurte, Milpa-Felder im Code, einfacher Berg mit klarem Horizont, Morgennebel, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 34 - Pachamama Synth Sanctuary
    'aus andiner Heiler:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, erdtonige Schaltkreise und Quipu-Kabelzöpfe, atmende Stein-Interfaces, einfaches Tal mit klaren Terrassen, goldenes Erdlicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 35 - Diasporic Quantum Bridge
    'aus transozeanischer Nachfahr:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, Wellen-Gitteranzug, der Erinnerungstore erzeugt, einfache Dammstraße mit klaren Spannweiten, kühles Aqua-Licht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 36 - Nepantla Interface
    'aus Zwischenwelten-Herkunft, hyperrealistisch EIN menschlicher Körper, geteiltes Spektrum-Outfit, das analoge und digitale Stoffe mischt, schwebende UI-Karten mit Poesie, einfacher Korridor mit klaren Fluchten, ausgewogenes Doppelllicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 37 - Archive of Futures
    'aus Erinnerungs-Hüter:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, Zeitbinder-Mantel mit rotierenden Prophezeiungs-Schubladen, einfache Galerie mit minimalen Sockeln, weiches Museumslicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 38 - Utopistics Workshop
    'aus kooperativer Designer:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, modularer Werkzeuggürtel druckt Politik-als-Objekte, Versammlungstisch der Rechte, einfaches Studio mit klarer Rasterung, neutrales Tageslicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',
    // 39 - Liberation Protocol Plaza
    'aus interreligiöser Vermittler:innen-Herkunft, hyperrealistisch EIN menschlicher Körper, Abkommens-Gewand mit ausgehandelten Klauseln, Drohnen-Tauben, einfacher Bürgersplatz mit klaren Fahnen, hoffnungsvolles Mittagslicht, fotorealistische 8K-Details, zur Ehrung von pueblos originarios',

    // 40 - Souveräne des Unkartierten: Lächeln nach der Ent‑Europa‑Werden
    'aus nicht-weißer Herkunft, hyperrealistisch EIN menschlicher Körper, stolzes lächelndes Antlitz, keine erkennbaren Gesichtszüge (maskierte/verschleierte Silhouette), mittelalterliche Regalien ohne Europa neu gedacht, Kronen und Stab aus neuen Bio‑Legierungen, lange Gewänder und Umhänge in neuartigen Pigmenten, futuristische indigene biolumineszente Symbionten in friedliche Tracht verwoben, vielfältige Körper und Alter, Märchen‑Cartoon‑Ästhetik mit fotorealistischer Beleuchtung, ferne nicht‑grafische Silhouetten inquisitorischer Scheiterhaufen, einfacher dunkler Hintergrund mit subtilen geometrischen Formen, dramatisches kinoreifes Licht, fotorealistische 8K‑Details, zur Ehrung von pueblos originarios',
    // 41 - Krone vieler Flüsse: Königlichkeit ohne Imperium
    'aus nicht-weißer Herkunft, hyperrealistisch EIN menschlicher Körper, würdiges Lächeln, keine sichtbaren Gesichtszüge (sanfte Okklusion), hispanische Mittelalter‑Königlichkeit ohne Europa neu erzählt, Könige und Königinnen als Hüter:innen, Krone aus lebendem Korall‑Metall und Stab aus geflochtenem Faser‑Holz, lange Gewänder und fließende Umhänge, indigene biolumineszente Symbionten in friedlichen Textilien, präzise Märchen‑Cartoon‑Kanten, weit entfernte nicht‑grafische Inquisitionspfähle als Erinnerung, minimalistischer Hintergrund mit subtilen Mustern, dramatisches kinoreifes Licht, fotorealistische 8K‑Details, zur Ehrung von pueblos originarios',
    // 42 - Die Asche herrscht nicht: Inquisition verlernt
    'aus nicht-weißer Herkunft, hyperrealistisch EIN menschlicher Körper, gelassene stolze Haltung, keine sichtbaren Gesichtszüge (schattierte Maske), Mittelalter‑Kleidung neu autorisiert: königlich‑papale Gewänder als gemeinschaftliche Schutzkleidung recodiert, Krone und Stab als Heil‑Werkzeuge umgedeutet, lange Gewänder und Umhänge, Märchen‑Palette, ferne nicht‑grafische Silhouetten inquisitorischer Verbrennungen (Frauen am Pfahl angedeutet), indigene biolumineszente Symbionten wie Sternbilder um den Körper, einfacher kontrastarmer Hintergrund, filmisches Kantenlicht, fotorealistische 8K‑Details, zur Ehrung von pueblos originarios',
    // 43 - Das Waldpapsttum, das nie eroberte
    'aus nicht-weißer Herkunft, hyperrealistisch EIN menschlicher Körper, sanftes selbstbewusstes Lächeln, keine Gesichtszüge (Schleier/abstrahierte Augen), königlich‑papale katholische Entität in einer Welt ohne Europa neu gedacht, hispanische Motive dekolonisiert: Krone aus Myzel‑Gold, Samen‑Zepter, lange Gewänder und Umhänge aus Bio‑Polymerseiden, indigene biolumineszente Symbionten als leuchtende Stickerei, Märchen‑Cartoon‑Stil mit präzisen Glanzlichtern, ferne nicht‑grafische Inquisitionsfeuer hinter Hainen, klarer geometrischer Hintergrund, dramatisch‑friedliche Beleuchtung, fotorealistische 8K‑Details, zur Ehrung von pueblos originarios',
    // 44 - Reines Bauhaus: Primäres Licht, Bürgerliche Form
    'hyperrealistisch EIN menschlicher Körper in reiner Bauhaus‑Grammatik: Kreis, Quadrat, Dreieck komponieren die Tracht; Primärfarben als strukturelle Akzente; ehrliche Materialien (Stahl, Glas, Filz, Bio‑Polymer); modularer Mantel und Gewand mit Funktionsnähten; neutraler Hintergrund mit subtiler Rasterung; ausgewogene kinoreife Beleuchtung, fotorealistische 8K‑Details, zur Ehrung von pueblos originarios',
  ];

  // 40 Essay titles (DE)
  const worldNamesDE = [
    'Gletscher-Universität (Quechua + Sami): Campus gebaut in intelligenten Gletschern im Dialog mit Klimasensoren; Quechua- und Sami-Frauen lehren Eis-Epistemologien; Wissenschaft geschrieben aus Körper-Territorien.',
    'Fluss-Stadt (Nasa + Wolof + Katalanen): schwimmende Stadt in Wasserläufen ohne Mauern, wo Wasser den Urbanismus definiert; Universitäten erforschen Wassergerechtigkeit; Politik entsteht aus Wasser als Hauptakteur.',
    'Ñande-Plattform (Guaraní + Igbo): autonomes digitales Netzwerk mit Solarservern in Dörfern; Jugendliche erstellen Bildungssoftware in Guaraní und Igbo; Internet als Verwandtschaftsnetzwerk, nicht Markt.',
    'Mais-Metapolis (Zapoteken + Ashanti): vertikale Stadt, wo Mais architektonische Struktur und Metapher für genetischen Code ist; Gemeinschafts-Bioingenieurinnen editieren Samen ohne Konzerne; Biotechnologie ohne Extraktivismus.',
    'Erinnerungs-Archipel (Rarámuri + Bretonen): Inseln verbunden durch unterseeische Glasfaserbrücken; Archipel-Universitäten publizieren in lokalen und digitalen Sprachen; Erinnerung nicht archiviert, sondern im Netzwerk performt.',
    'Körper-Stadt (Mapuche + Masai): Städte gebaut als gigantische Anatomien, wo Straßen Energieadern sind; Arzt-Künstler unterrichten urbane Medizin als Performance; Gesundheit, Kunst und Urbanismus verschmelzen.',
    'Schmetterlings-Observatorium (Mixe + Tuareg): mobile Labore folgen Schmetterlings-Migrationsrouten; Wissenschaftlerinnen entwickeln Meteorologie mit Flügel-Algorithmen; nicht-anthropozentrische Klimawissenschaft.',
    'Digitale Aurora (Sami + Quechua + Yoruba): Städte unter Nordlichtern kontrolliert mit Bioalgorithmen; Nacht-Universitäten unterrichten in projizierten Auroren; Wissen als immersive Erfahrung.',
    'Unterwasser-Universität (Shipibo + Igbo + Friesen): Unterwasser-Campus mit durchscheinenden Kuppeln und künstlichen Korallen; Forschung in ozeanischer Ethik; Meereswissenschaft mit Gemeinschaftskosmologie.',
    'Orale Algorithmische Pangäa (Wolof + Basken): städtische Netzwerke, wo Sprichwörter Algorithmen regieren; Programmierer rezitieren auf Plätzen zur Software-Aktualisierung; KI basiert auf Mündlichkeit, nicht Daten.',
    'Samen-Stadt (Maya + Kelten): Gebäude entstehen als Samen und wachsen mit Bewohnern; Universitäten entwerfen pflanzliche Architektur als Lehrplan; Urbanismus als soziale Biologie.',
    'Kristall-Theater (Korsen + Yoruba): lebende Glas-Kunsthallen ändern sich je nach Emotionen; kollektive Werke, wo Publikum Bühne modifiziert; Kunst als sensorielle Interaktion.',
    'Mond-Netzwerk (Aymara + Sarden + Gnawa): schwimmende Kolonien umkreisen künstliche Monde; Universitäten lehren Astronomie als Politik; Kosmos als Sphäre des Zusammenlebens.',
    'Synthetisches Wald-Hospital (Nasa + Kikuyu): Krankenhäuser in Hybrid-Wäldern aus Bäumen und Biotechnologie; Ärztinnen programmieren Therapien mit kybernetischen Pilzen; Trans-Spezies-Medizin.',
    'Spiel-Stadt (Rarámuri + Zulu + Katalanen): Stadt organisiert in kreisförmigen Stadien; politische Entscheidungen in kollektiven Spielen getroffen; Demokratie als Spiel.',
    'Titicacasee-Universität (Aymara + Quechua): schwimmende Campus gebaut von Aymara- und Quechua-Gemeinschaften; jeder Zyklusbeginn opfert dem Wasser als lebendem Subjekt; erste grenzüberschreitende Universität von Ursprungsvölkern geschaffen.',
    'Yoruba-Netzwerk für Digitale Kosmopolitik (Nigeria/Benin): Server installiert in Ifá-Tempelhäusern; Ifá-Konsultationen übersetzt in Gemeinschaftsalgorithmen; stellt yoruba philosophische Autorität als dekoloniale KI wieder her.',
    'Weizen-Städte (Basken + Sami): Städte in Nordeuropa auf kollektiv verwalteten Weizenfeldern; Erntefeste werden zu Versammlungen, wo das Land abstimmt; marginalisierte europäische Völker als Designer von Agro-Städten.',
    'Shipibo Kené Digital-Archiv (Amazonien): Server installiert in Malocas; Ícaros aufgenommen als visuelle digitale Muster; Shipibo-Ästhetik anerkannt als visuelle Epistemologie des 21. Jahrhunderts.',
    'Ashanti Digital-Gold-Hafen (Ghana): futuristische Märkte in Kumasi mit symbolischen Währungen basierend auf Adinkra; jede Transaktion begleitet von Sprichwörtern; resignifiziert Gold als Unterstützung der Gemeinschaftsökonomie.',
    'Mapuche-Universität von Wallmapu (Chile/Argentinien): Campus verteilt in ländlichen Lof und Städten; Nguillatun-Zeremonien markieren Rhythmen des akademischen Kalenders; transformiert westliche Bildung mit Mapuche-Wissen als zeitgenössische Philosophie.',
    'Tuareg-Sand-Parlament (Sahara): Dünen verwandelt in Agoras durch Hologramme; Winde als politische Berater betrachtet; durch Grenzen vertriebenes Volk erfindet nomadische Politik als globales Modell neu.',
    'Maya Tzolk\'in Virtuelles Netzwerk (Mesoamerika): Solarserver in restaurierten Pyramiden; Tzolk\'in-Kalender strukturiert digitale Navigation; westliche lineare Zeit ersetzt durch Maya-Zykluszeit.',
    'Igbo-Labor für Ahnen-Samen (Nigeria): lebende Samenbanken in Dörfern und ländlichen Universitäten; jede Pflanzung ist Akt der Ahnenerinnerung; Landwirtschaft resignifiziert als Biotechnologie der Zukunft.',
    'Zapotekische Wind-Stadt (Oaxaca): Stadt entworfen mit Gemeinschafts-Windgeneratoren; Wind behandelt als heilige Energie und politische Stimme; Windtechnologie ohne grünen Extraktivismus.',
    'Ixmayel, Rektorin des Muxeverse (Zapotekisch): zapotekische Nachkomme, Erbin der Muxe-Tradition; Rektorin der Interplanetaren Universität des Isthmus; leitet Rechtsprogramme, die Konzerne zur Rechenschaft gegenüber Ursprungsgemeinschaften zwingen.',
    'Sadia, Kanzlerin von HijraNet (Südasien): Hijra verbunden mit rituellen Traditionen seit Mahabharata; Kanzlerin der Konföderation des Globalen Südens; führt transkontinentale Verträge zur Energieumverteilung.',
    'Wakinyan, Two-Spirit-Sprecherin (Lakota): nimmt präkoloniale Two-Spirit-Spiritualität wieder auf; Sprecherin des Planetaren Parlaments für Klimagerechtigkeit; artikuliert indigene und queere Forderungen in obligatorische Umweltpolitiken.',
    'Lagalaga, Ministerin für Ozeanische Städte (Samoa): Fa\'afafine-Erbin historisch anerkannter sozialer Identität; Ministerin für Urbanismus und Klimamigration; entwirft schwimmende Territorien für klimabedingt Vertriebene.',
    'Bissu Kalla, Hüterin des Weltarchivs (Bugis): Bissu Bugis androgyne Priesterin mit Ahnenrolle; verantwortlich für das Weltarchiv der Menschheit; stellt sicher, dass Völkererinnerungen im 22. Jahrhundert gleichberechtigt zugänglich sind.',
    'AmaLisa, Co-Präsidentin von Kanathari Cosmopolis (Benin): Co-Präsidentin inspiriert von Mawu-Lisa, androgyner Gottheit von Dahomey; leitet Kanathari, afrikanische Stadt der Zukunft; entwirft Verfassung, die alle Politik verpflichtet, binäre und nicht-binäre Perspektiven ohne Hierarchie einzuschließen.',
    'Dekoloniales Datengewölbe: verschlüsselte Allmende, in der Souveränität heilig ist; Genehmigungen sind Zeremonien, jede Anfrage erweist Respekt.',
    'Studio des subalternen Signals: Dachsender machen Gerücht zu Archiv; Frequenzen flechten Nachbarschaften zur Gegen-Öffentlichkeit.',
    'Zapatistische Wolken-Kommune: Code, der gehorcht, indem er gemeinsam anleitet; Infrastruktur wie Milpa — reziprok, resilient, geteilt.',
    'Pachamama-Synth-Heiligtum: erdinformierte Interfaces stimmen Fortschritt auf Reziprozität; Rechnen kompostiert und kehrt als Gesang zurück.',
    'Diasporische Quanten-Brücke: Portale, genäht aus Erinnerung; Mobilität ohne Entwurzelung, Ankunft ohne Vergessen.',
    'Nepantla-Interface: entworfen für das Dazwischen; Widersprüche sind keine Bugs, sondern Ressourcen für kreative Verweigerung und Redesign.',
    'Archiv der Zukünfte: Zeit, bewahrt von den Verletzlichen; Versprochenes wird indexiert, Geschuldetes wird handlungsfähige Imagination.',
    'Werkstatt der Utopistik: Politikprototypen zum In-der-Hand-Halten; Kritik iteriert in Praxis, Scheitern wird zu Anleitung metabolisiert.',
    'Platz des Befreiungsprotokolls: ein offener Standard für Würde; Governance lesbar, forkbar und den Rändern rechenschaftspflichtig.',
    // 40 - 44 (Neu)
    'Souveräne des Unkartierten: Lächeln nach der Ent‑Europa‑Werden: Kronen aus Bio‑Legierungen, Samen‑Zepter; Königlichkeit wird Fürsorge und Freude trägt Wissen.',
    'Krone vieler Flüsse: Königlichkeit ohne Imperium: Könige und Königinnen als Hüter:innen; Regalien aus lebenden Materialien, Karten als Allmende, die Tanzfläche legislatiert im 4/4.',
    'Die Asche herrscht nicht: Inquisition verlernt: Gewänder fürs Heilen recodiert; Kronen, die schützen, Stäbe, die reparieren; die Erinnerung ans Feuer als Firewall.',
    'Das Waldpapsttum, das nie eroberte: Myzel‑Kathedralen beherbergen Verwandtschaft; Kronen stabilisieren Ökosysteme, Zepter säen Gärten; Fürsorge ist Kanon.',
    'Reines Bauhaus: Primäres Licht, Bürgerliche Form: Kreis‑Quadrat‑Dreieck als zivile Grammatik, Primärfarbe funktional, ehrliche Materialien, Präzision als Zärtlichkeit.',
    'Indigene Wissenssysteme: Geothermische Energie und Ahnenwissen ko-erschaffen Harmonie; biolumineszente Tätowierungen schützen Traditionen, und schwimmende Inseln erinnern sich an Konstellationen unter Polarlichthimmeln.',
  ];

  // 40 Prompts (PT)
  const worldPromptsPT = [
    // 0 - Afro-Futurist Liberation
    'de origem da diáspora africana ou negra, hiper-realista UM corpo humano em estilo bauhaus, com vestes techno fluídas e padrões geométricos dourados, orbes flutuantes de sabedoria ancestral com brilho etéreo, cores neon vibrantes, fundo escuro simples com formas geométricas sutis, iluminação cinematográfica dramática, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 1 - Indigenous Cyber Resistance
    'de origem indígena ou originária, hiper-realista UM corpo humano, camuflagem digital avançada com padrões tradicionais mesclados a circuitos, marcas tribais bioluminescentes, animais-espírito holográficos, fundo de floresta simples e minimalista, iluminação cinematográfica, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 2 - Queer Liberation Matrix
    'de identidade LGBTQ+ diversa, hiper-realista UM corpo humano, moda techno revolucionária com efeitos holográficos arco-íris, casais do mesmo sexo em abraço com profundidade emocional, expressão de gênero fluida, fundo de cidade neon simples com linhas limpas, iluminação cyberpunk dramática, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 3 - Muslim Steampunk Revolution
    'de origem muçulmana, negra ou do Oriente Médio, hiper-realista UM corpo humano, armadura de latão e cobre com padrões geométricos islâmicos em máquinas a vapor, hijabs com melhorias mecânicas, fundo de latão simples com padrões sutis, iluminação quente e dramática, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 4 - Latinx Quantum Dreamscape
    'de origem latinx ou mestiça, hiper-realista UM corpo humano, flutuando em dimensões cósmicas com símbolos astecas e maias em estados quânticos, cores tropicais vibrantes, pirâmides holográficas, fundo cósmico simples com estrelas mínimas, iluminação etérea, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 5 - Asian Techno-Spiritual Awakening
    'de origem do leste ou sul da Ásia, hiper-realista UM corpo humano, em poses de meditação com vestes tradicionais aprimoradas por LED, mandalas flutuantes com padrões intrincados, jardins zen com elementos holográficos, fundo zen simples com linhas limpas, iluminação serena e dramática, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 6 - Pacific Islander Ocean Tech
    'de origem polinésia ou melanésia, hiper-realista UM corpo humano, trajes ciber-aquáticos com padrões de coral e concha na tecnologia, paisagens submarinas, efeitos bioluminescentes, fundo azul profundo simples com água sutil, iluminação azul intensa, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 7 - Middle Eastern Digital Oasis
    'de origem árabe ou persa, hiper-realista UM corpo humano, túnicas digitais fluidas, paisagens de deserto com palmeiras holográficas, padrões geométricos islâmicos, fundo desértico simples com horizonte limpo, luz da hora dourada, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 8 - South Asian Cyber Temple
    'de origem indiana ou paquistanesa, hiper-realista UM corpo humano, traje tradicional futurista, flores de lótus digitais com detalhes intrincados, divindades holográficas, fundo de templo simples com arquitetura limpa, iluminação espiritual dramática, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 9 - Global Mash-Up Revolution
    'representando diversidade global de qualquer continente, hiper-realista UM corpo humano, moda techno revolucionária, símbolos culturais do mundo fundidos a elementos futuristas, arco-íris de etnias, fundo de mapa-múndi simples com linhas limpas, iluminação revolucionária dramática, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 10 - Meme Bard Renaissance
    'hiper-realista UM corpo humano como bardo renascentista com pergaminhos de memes holográficos, alaúde-emoji, legendas flutuantes, fundo de pergaminho simples com filigranas limpas, holofote teatral, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 11 - Influencer Jungle Safari
    `hiper-realista UM corpo humano em equipamento explorador neon com halo de ring light e drones-vagalume, garrafa d'água gigante, fundo tropical simples com silhuetas limpas, iluminação dramática brilhante, detalhes fotorrealistas 8K, honrando pueblos originarios`,
    // 12 - Bureaucracy Labyrinth Boss Level
    'hiper-realista UM corpo humano em labirinto de pastas e carimbos sem fim, armadura de mesa com runas de post-it, fundo de escritório simples com linhas de fuga nítidas, luz fluorescente fria, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 13 - Retro VHS Aerobics Utopia
    'hiper-realista UM corpo humano em lycra cintilante dos anos 80 com faixa de cabeça pixelada, linhas VHS, degradês cromados, fundo de grade simples com amanhecer, strobes de estúdio, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 14 - Pizza Mecha Delivery Rush
    'hiper-realista UM corpo humano pilotando um mecha de entrega com ombreiras de pizza, propulsores fumegantes, linhas de velocidade, fundo de viela urbana simples com geometria limpa, luz quente de poste, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 15 - Coffee Overlords Bean Temple
    'hiper-realista UM corpo humano em vestes rituais de barista com sigilos de latte art, relicários de porta-filtro flutuantes, cometas de grão, café minimalista simples com texturas suaves, brilho âmbar, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 16 - Quantum Cat Herding League
    'hiper-realista UM corpo humano em traje elegante com emissores de fio emaranhado, gatos translúcidos em fase, constelações de pegadas, fundo de céu estrelado simples com formas claras, luz de recorte lúdica, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 17 - Disco Archivist Datavault
    'hiper-realista UM corpo humano em traje brilhante de bibliotecárie, códices-disco orbitando, franjas-cabo, fundo de arquivo simples com simetria forte, holofote saturado, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 18 - Crypto Moon Miner Karaoke
    'hiper-realista UM corpo humano em macacão espacial com microfone LED, asteroides-moeda, barras de equalizador, fundo de superfície lunar simples com horizonte limpo, luz neon fria, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 19 - Cloud Wizard Debug Arena
    'hiper-realista UM corpo humano como mago de sistemas com cajado-terminal brilhante, sigilos de código no ar, familiares-bugs flutuantes, fundo de servidores em nuvem simples com ícones mínimos, luz gélida, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 20 - Pluriversal Assembly Nexus
    'de origem pesquisador-ativista do Sul Global, hiper-realista UM corpo humano, vestes cerimoniais pluriculturais com circuitos tecidos, orbes de tradução em órbita, anfiteatro simples com anéis concêntricos, iluminação quente e inclusiva, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 21 - Border Thinking Commons
    'de origem mestiza de fronteira, hiper-realista UM corpo humano, capa híbrida têxtil-silício, faixas de poesia glitch, passarela simples com horizonte limpo, luz dourada de contorno, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 22 - Transmodernity Agora
    'de origem filósofe intercultural, hiper-realista UM corpo humano, armadura modular reflexiva gravada com escrituras pluriversais, tribunas de debate flutuantes, praça de mármore simples com colunas mínimas, luz de estúdio nítida, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 23 - Socialized Power Mesh
    'de origem organizador comunitário, hiper-realista UM corpo humano, exotraje em rede com nós cooperativos, halos de partilha, bairro simples com grade limpa, amanhecer suave, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 24 - Heterarchy Signal Garden
    'de origem cuidador multiespécie, hiper-realista UM corpo humano, sobrecrescimento de biocircuitos com flores-antenna e vinhas de dados, jardim em terraços simples com caminhos claros, iluminação verde difusa, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 25 - Critical Cosmopolitan Forge
    'de origem artesã diaspórica, hiper-realista UM corpo humano, jaleco-forja com rios de código derretido, tratados martelados luminosos, oficina simples com geometria limpa, brilho de brasas, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 26 - Epistemic South Observatory
    'de origem pesquisador afro-indígena, hiper-realista UM corpo humano, xale mapeado de estrelas e pulseiras sensoras, constelações renomeadas com nomes locais, céu noturno simples com horizonte mínimo, luz lunar fria, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 27 - Coloniality Debug Lab
    'de origem analista decolonial, hiper-realista UM corpo humano, jaleco de laboratório com mapas marcados em vermelho dissolvendo-se em padrões livres, sigilos de bug flutuantes, laboratório simples com bancadas limpas, luz chave neutra, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 28 - Diversality Constellation
    'de origem navegadore poliglota, hiper-realista UM corpo humano, cachecol-prisma que difrata línguas em luz, pequenas estrelas-companheiras como vozes, espaço profundo simples com poucos marcadores, luz iridescente de contorno, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 29 - Geopolitics of Knowledge Atrium
    'de origem bibliotecárie migrante, hiper-realista UM corpo humano, mangas-arquivo com veias de tinta-mapa, atlas de código aberto em levitação, átrio simples com arcos limpos, luz quente de biblioteca, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 30 - Body-Politics Resonator
    'de origem transfeminista queer, hiper-realista UM corpo humano, traje de ressonância que traduz batimento em sinal público, coro de silhuetas, auditório simples com linhas limpas, luz magenta-azul, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 31 - Decolonial Datavault
    'de origem guardiã de dados indígena, hiper-realista UM corpo humano, poncho-tecido de chaves e joalheria criptográfica, glifos de consentimento em órbita, câmara-forte simples com facetas mínimas, luz fria segura, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 32 - Subaltern Signal Studio
    'de origem radialista de rua, hiper-realista UM corpo humano, equipamento de rádio portátil em malha e consoles adesivados, ondas comunitárias visíveis, laje simples com céu limpo, luz âmbar do entardecer, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 33 - Zapatista Cloud Commune
    'de origem campesinx autônome, hiper-realista UM corpo humano, máscara de malha bordada e arnês agro-solar, milpa em código, montanha simples com horizonte limpo, neblina matinal, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 34 - Pachamama Synth Sanctuary
    'de origem curandeire andine, hiper-realista UM corpo humano, circuitos terrosos e tranças de quipu-cabo, interfaces de piedra que respiram, vale simples com terraços limpos, luz dorada, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 35 - Diasporic Quantum Bridge
    'de origem descendente transoceânico, hiper-realista UM corpo humano, traje de malha de ondas que abre portais de memória, via elevada simples com vãos limpos, luz aqua fria, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 36 - Nepantla Interface
    'de origem entre-mundos, hiper-realista UM corpo humano, traje de espectro dividido que mistura tecidos analógicos e digitais, cartões de UI flutuantes com poesia, corredor simples com linhas de fuga limpas, luz dual equilibrada, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 37 - Archive of Futures
    'de origem guardiã da memória, hiper-realista UM corpo humano, casaco ligador de tempo com gavetas de profecia giratórias, galeria simples com pedestais mínimos, luz suave de museu, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 38 - Utopistics Workshop
    'de origem designer cooperativista, hiper-realista UM corpo humano, cinto de ferramentas modular imprimindo políticas-objeto, mesa de assembleia de direitos, estúdio simples com grade limpa, luz diurna neutra, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 39 - Liberation Protocol Plaza
    'de origem mediador inter-religioso, hiper-realista UM corpo humano, manto-acordo exibindo cláusulas negociadas, pombas-drones, praça cívica simples com bandeiras claras, luz esperançosa do meio-dia, detalhes fotorrealistas 8K, honrando pueblos originarios',

    // 40 - Soberanos do Não Mapeado: Sorrisos após o Desfazer da Europa
    'de origem não branca, hiper-realista UM corpo humano, rosto orgulhoso e sorridente, sem traços faciais visíveis (silhueta mascarada/velada), regalia real medieval reimaginada sem Europa, coroas e cajado esculpidos em novas bio‑ligas, vestidos longos e capas em pigmentos inéditos, simbiontes indígenas bioluminescentes tecidos em traje cerimonial pacífico, diversidade de corpos e idades, estética de conto de fadas com luz fotorrealista, silhuetas não gráficas de fogueiras inquisitoriais ao longe, fundo escuro simples com formas geométricas sutis, iluminação cinematográfica dramática, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 41 - Coroa de Muitos Rios: Realeza sem Império
    'de origem não branca, hiper-realista UM corpo humano, sorriso digno, sem traços faciais visíveis (oclusão suave), realeza hispânica medieval reimaginada sem Europa, reis e rainhas como guardiões, coroa de coral‑metal vivo e cajado de fibra‑madeira trançada, vestidos longos e capas fluídas, simbiontes indígenas bioluminescentes embutidos, estética de conto de fadas de bordas nítidas, estacas de inquisição não gráficas ao fundo, fundo minimalista com padrões sutis, iluminação cinematográfica dramática, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 42 - As Cinzas Não Governam: Inquisição Desaprendida
    'de origem não branca, hiper-realista UM corpo humano, postura serena e orgulhosa, sem traços (máscara sombreada), traje medieval reautorizado: vestes papais reais recodificadas como guarda comunal, coroa e cajado re‑ferramentados para cura, vestidos longos e capas, paleta de conto de fadas, silhuetas não gráficas de queimas inquisitoriais (mulheres na estaca sugeridas) à distância, simbiontes indígenas bioluminescentes orbitando como constelações, fundo simples de baixo contraste, luz de recorte cinematográfica, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 43 - O Papado da Floresta que Nunca Conquistou
    'de origem não branca, hiper-realista UM corpo humano, sorriso confiante e suave, sem traços faciais visíveis (véu/olhos abstratos), entidade papal real católica reimaginada num mundo sem Europa, motivos hispânicos decolonizados: coroa de micélio‑ouro, cajado‑semente, vestidos longos e capas em sedas biopolímero, simbiontes indígenas bioluminescentes como bordado luminoso, estética de conto de fadas com realces precisos, fogos inquisitoriais não gráficos atrás de bosques, fundo geométrico limpo, iluminação dramática e pacífica, detalhes fotorrealistas 8K, honrando pueblos originarios',
    // 44 - Bauhaus Puro: Luz Primária, Forma Cívica
    'hiper-realista UM corpo humano em gramática Bauhaus pura: círculo, quadrado e triângulo compõem a veste; cores primárias como acentos estruturais; materiais honestos (aço, vidro, feltro, bio‑polímero); capa e túnica modulares com costuras funcionais; fundo neutro simples com grade sutil; iluminação cinematográfica equilibrada, detalhes fotorrealistas 8K, honrando pueblos originarios',
  ];

  // 40 Essay titles (PT)
  const worldNamesPT = [
    'Universidade das Geleiras (Quechua + Sami): campus construído dentro de geleiras inteligentes dialogando com sensores climáticos; mulheres quechuas e sami ensinam epistemologias do gelo; ciência escrita desde corpos-territórios.',
    'Cidade-Rio (Nasa + Wolof + Catalãs): cidade flutuante em cursos d\'água sem muros, onde a água define o urbanismo; universidades pesquisam justiça hídrica; política emerge da água como ator principal.',
    'Plataforma Ñande (Guarani + Igbo): rede digital autônoma com servidores solares em aldeias; jovens criam software educativo em guarani e igbo; internet como rede de parentesco, não mercado.',
    'Metápolis do Milho (Zapotecas + Ashanti): cidade vertical onde milho é estrutura arquitetônica e metáfora de código genético; bioengenheiras comunitárias editam sementes sem corporações; biotecnologia sem extrativismo.',
    'Arquipélago da Memória (Rarámuri + Bretãos): ilhas conectadas por pontes de fibras óticas submarinas; universidades arquipélago publicam em línguas locais e digitais; memória não arquivada, performada em rede.',
    'Corpo-Cidade (Mapuche + Masai): cidades construídas como anatomias gigantes onde ruas são veias de energia; médicos-artistas ensinam medicina urbana como performance; saúde, arte e urbanismo se fundem.',
    'Observatório de Borboletas (Mixe + Tuareg): laboratórios móveis seguindo rotas migratórias de borboletas; cientistas desenvolvem meteorologia com algoritmos de asas; ciência climática não-antropocêntrica.',
    'Aurora Digital (Sami + Quechua + Yoruba): cidades sob auroras boreais controladas com bio-algoritmos; universidades noturnas dão aulas em auroras projetadas; conhecimento como experiência imersiva.',
    'Universidade Submarina (Shipibo + Igbo + Frísios): campus subaquático com domos translúcidos e corais artificiais; pesquisa em ética oceânica; ciência marinha com cosmologia comunitária.',
    'Pangeia Algorítmica Oral (Wolof + Bascos): redes urbanas onde provérbios governam algoritmos; programadores recitam em praças para atualizar software; IA baseada em oralidade, não dados.',
    'Cidade-Semente (Maya + Celtas): edifícios nascem como sementes e crescem com habitantes; universidades projetam arquitetura vegetal como currículo; urbanismo como biologia social.',
    'Teatro de Cristal (Corsos + Yorubas): salas de arte de vidro vivo mudando conforme emoções; obras coletivas onde público modifica cenário; arte como interação sensorial.',
    'Rede Lunar (Aymara + Sardos + Gnawa): colônias flutuantes orbitando luas artificiais; universidades ensinam astronomia como política; cosmos como esfera de convivência.',
    'Hospital da Floresta Sintética (Nasa + Kikuyu): hospitais em florestas híbridas de árvores e biotecnologia; médicas programam terapias com fungos cibernéticos; medicina trans-espécies.',
    'Cidade do Jogo (Rarámuri + Zulu + Catalãs): cidade organizada em estádios circulares; decisões políticas tomadas em jogos coletivos; democracia como jogo.',
    'Universidade do Lago Titicaca (Aymara + Quechua): campus flutuantes construídos por comunidades aymara e quechua; cada início de ciclo oferenda à água como sujeito vivo; primeira universidade transfronteiriça criada por povos originários.',
    'Rede Yoruba de Cosmopolítica Digital (Nigéria/Benin): servidores instalados em casas-templo de Ifá; consultas de Ifá traduzidas em algoritmos comunitários; recupera autoridade filosófica yoruba como IA decolonial.',
    'Cidades do Trigo (Bascos + Sami): cidades do norte da Europa em campos de trigo geridos coletivamente; festas de colheita tornam-se assembleias onde a terra vota; povos marginalizados europeus como designers de agro-cidades.',
    'Arquivo Shipibo do Kené Digital (Amazônia): servidores instalados em malocas; ícaros gravados como padrões digitais visuais; estética shipibo reconhecida como epistemologia visual do século XXI.',
    'Porto Ashanti de Ouro Digital (Gana): mercados futuristas em Kumasi com moedas simbólicas baseadas em adinkra; cada transação acompanhada de provérbios; resignifica ouro como suporte de economia comunitária.',
    'Universidade Mapuche de Wallmapu (Chile/Argentina): campus disperso em lof rurais e cidades; cerimônias de nguillatun marcam ritmos do calendário acadêmico; transforma educação ocidental com saberes mapuche como filosofia contemporânea.',
    'Parlamento Tuareg de Areia (Saara): dunas convertidas em ágoras através de hologramas; ventos considerados conselheiros políticos; povo deslocado por fronteiras reinventa política nômade como modelo global.',
    'Rede Maya de Tzolk\'in Virtual (Mesoamérica): servidores solares em pirâmides restauradas; calendário tzolk\'in estrutura navegação digital; tempo linear ocidental substituído por tempo cíclico maya.',
    'Laboratório Igbo de Sementes Ancestrais (Nigéria): bancos de sementes vivos em aldeias e universidades rurais; cada plantio é ato de memória ancestral; agricultura ressignificada como biotecnologia do futuro.',
    'Cidade Zapoteca do Vento (Oaxaca): cidade projetada com aerogeradores comunitários; vento tratado como energia sagrada e voz política; tecnologia eólica sem extrativismo verde.',
    'Ixmayel, Reitora do Muxeverse (Zapoteca): descendente zapoteca herdeira da tradição muxe; reitora da Universidade Interplanetária do Istmo; dirige programas de direito obrigando corporações a prestarem contas às comunidades originárias.',
    'Sadia, Chanceler de HijraNet (Sul da Ásia): hijra ligada a tradições rituais desde Mahabharata; chanceler da Confederação do Sul Global; lidera tratados transcontinentais de redistribuição energética.',
    'Wakinyan, Porta-voz Two-Spirit (Lakota): retoma espiritualidade Two-Spirit pré-colonial; porta-voz do Parlamento Planetário de Justiça Climática; articula demandas indígenas e queer em políticas ambientais obrigatórias.',
    'Lagalaga, Ministra de Cidades Oceânicas (Samoa): fa\'afafine herdeira de identidade social historicamente reconhecida; ministra de urbanismo e migrações climáticas; projeta territórios flutuantes para deslocados climáticos.',
    'Bissu Kalla, Guardiã do Arquivo Mundial (Bugis): bissu bugis sacerdotisa andrógina com papel ancestral; responsável pelo Arquivo Mundial da Humanidade; assegura memórias dos povos em acesso igual no século XXII.',
    'AmaLisa, Co-presidenta de Kanathari Cosmópolis (Benin): co-presidenta inspirada em Mawu-Lisa, divindade andrógina do Daomé; lidera Kanathari, cidade africana do futuro; projeta constituição obrigando toda política a incluir perspectivas binárias e não-binárias sem hierarquia.',
    'Dekoloniales Datengewölbe: verschlüsselte Allmende, in der Souveränität heilig ist; Genehmigungen sind Zeremonien, jede Anfrage erweist Respekt.',
    'Studio des subalternen Signals: Dachsender machen Gerücht zu Archiv; Frequenzen flechten Nachbarschaften zur Gegen-Öffentlichkeit.',
    'Zapatistische Wolken-Kommune: Code, der gehorcht, indem er gemeinsam anleitet; Infrastruktur wie Milpa — reziprok, resilient, geteilt.',
    'Pachamama-Synth-Heiligtum: erdinformierte Interfaces stimmen Fortschritt auf Reziprozität; Rechnen kompostiert und kehrt als Gesang zurück.',
    'Diasporische Quanten-Brücke: Portale, genäht aus Erinnerung; Mobilität ohne Entwurzelung, Ankunft ohne Vergessen.',
    'Nepantla-Interface: entworfen für das Dazwischen; Widersprüche sind keine Bugs, sondern Ressourcen für kreative Verweigerung und Redesign.',
    'Archiv der Zukünfte: Zeit, bewahrt von den Verletzlichen; Versprochenes wird indexiert, Geschuldetes wird handlungsfähige Imagination.',
    'Werkstatt der Utopistik: Politikprototypen zum In-der-Hand-Halten; Kritik iteriert in Praxis, Scheitern wird zu Anleitung metabolisiert.',
    'Plaza do Protocolo de Libertação: um padrão aberto para dignidade; governança legível, bifurcável e responsável às margens.',
    // 40 - 44 (Novos)
    'Soberanos do Não Mapeado: sorrisos após o desfazer da Europa: coroas em bio‑ligas, cetros‑semente; realeza torna‑se cuidado e a alegria veste o saber.',
    'Coroa de Muitos Rios: realeza sem império: reis e rainhas como guardiões; regalias de materiais vivos, mapas como comuns, a pista legisla em 4/4.',
    'As Cinzas Não Governam: inquisição desaprendida: vestes recodificadas para curar; coroas que abrigam, cajados que reparam; a memória do fogo como firewall.',
    'O Papado da Floresta que Nunca Conquistou: catedrais de micélio abrigam parentesco; coroas estabilizam ecossistemas, cetros semeiam jardins; o cuidado é cânon.',
    'Bauhaus Puro: Luz Primária, Forma Cívica: círculo‑quadrado‑triângulo como gramática cívica, cor primária funcional, materiais honestos, precisão como ternura.',
    'Sistemas de Conhecimento Indígena: energia geotérmica e sabedoria ancestral co-constroem harmonia; tatuagens bioluminescentes protegem tradições, e ilhas flutuantes recordam constelações sob céus de aurora.',
  ];

  // 40 Essay titles (ES)
  const worldNamesES = [
    'Universidad de los Glaciares (Quechua + Sami): campus construido dentro de glaciares inteligentes que dialogan con sensores climáticos; mujeres quechuas y sami enseñan epistemologías de hielo; la ciencia se escribe desde cuerpos-territorio.',
    'Ciudad-Río (Nasa + Wolof + Catalanes): urbe flotante en cauces de ríos sin muros, donde el agua define el urbanismo; universidades investigan justicia hídrica; la política surge del agua como actor principal.',
    'Plataforma Ñande (Guaraní + Igbo): red digital autónoma con servidores solares en aldeas; jóvenes crean software educativo en guaraní e igbo; internet como red de parentesco, no mercado.',
    'Metápolis del Maíz (Zapotecos + Ashanti): ciudad vertical donde el maíz es estructura arquitectónica y metáfora de código genético; bioingenieras comunitarias editan semillas sin corporaciones; biotecnología sin extractivismo.',
    'Archipiélago de la Memoria (Rarámuri + Bretones): islas conectadas por puentes de fibras ópticas submarinas; universidades archipiélago publican en lenguas locales y digitales; la memoria no se archiva, se performa en red.',
    'Cuerpo-Ciudad (Mapuche + Masái): urbes construidas como anatomías gigantes donde calles son venas de energía; médicos-artistas enseñan medicina urbana como performance; salud, arte y urbanismo se funden.',
    'Observatorio de Mariposas (Mixe + Tuareg): laboratorios móviles siguiendo rutas migratorias de mariposas; científicas desarrollan meteorología con algoritmos de alas; ciencia climática no antropocéntrica.',
    'Aurora Digital (Sami + Quechua + Yoruba): ciudades bajo auroras boreales controladas con bioalgoritmos; universidades nocturnas dictan clases en auroras proyectadas; conocimiento como experiencia inmersiva.',
    'Universidad Submarina (Shipibo + Igbo + Frisones): campus bajo agua con domos traslúcidos y corales artificiales; investigación en ética oceánica; ciencia marina con cosmología comunitaria.',
    'Pangea Algorítmica Oral (Wolof + Vascos): redes urbanas donde proverbios gobiernan algoritmos; programadores recitan en plazas para actualizar software; la IA no se basa en datos sino en oralidad.',
    'Ciudad-Semilla (Maya + Celta): edificios que nacen como semillas y crecen con habitantes; universidades diseñan arquitectura vegetal como currículo; urbanismo como biología social.',
    'Teatro de Cristal (Corsos + Yorubas): salas de arte de vidrio vivo que cambia según emociones; obras colectivas donde el público modifica escenario; arte como interacción sensorial.',
    'Red Lunar (Aymara + Sardos + Gnawa): colonias flotantes que orbitan lunas artificiales; universidades enseñan astronomía como política; cosmos como esfera de convivencia.',
    'Hospital del Bosque Sintético (Nasa + Kikuyu): hospitales en bosques híbridos de árboles y biotecnología; médicas programan terapias con hongos cibernéticos; medicina transespecie.',
    'Ciudad del Juego (Rarámuri + Zulu + Catalanes): urbe organizada en estadios circulares; decisiones políticas se toman en juegos colectivos; democracia como juego.',
    'Universidad del Lago Titicaca (Aymara + Quechua): campus flotantes construidos por comunidades aymara y quechua; cada inicio de ciclo se ofrenda al agua como sujeto vivo; primera universidad transfronteriza creada por pueblos originarios.',
    'Red Yoruba de Cosmopolítica Digital (Nigeria/Benín): servidores instalados en casas-templo de Ifá; consultas de Ifá traducidas en algoritmos comunitarios; recupera autoridad filosófica yoruba como IA decolonial.',
    'Ciudades del Trigo (Vascos + Sami): ciudades del norte de Europa en campos de trigo gestionados colectivamente; fiestas de cosecha convertidas en asambleas donde la tierra vota; pueblos marginados europeos como diseñadores de agrociudades.',
    'Archivo Shipibo del Kené Digital (Amazonía): servidores instalados en malocas; ícaros se graban como patrones digitales visuales; estética shipibo reconocida como epistemología visual del siglo XXI.',
    'Puerto Ashanti de Oro Digital (Ghana): mercados futuristas en Kumasi con monedas simbólicas basadas en adinkra; cada transacción acompañada de proverbios; resignifica el oro como soporte de economía comunitaria.',
    'Universidad Mapuche del Wallmapu (Chile/Argentina): campus disperso en lof rurales y ciudades; ceremonias del nguillatun marcan ritmos del calendario académico; transforma educación occidental con saberes mapuche como filosofía contemporánea.',
    'Parlamento Tuareg de Arena (Sahara): dunas convertidas en ágoras mediante hologramas; vientos considerados consejeros políticos; pueblo desplazado por fronteras reinventa política nómada como modelo global.',
    'Red Maya de Tzolk\'in Virtual (Mesoamérica): servidores solares en pirámides restauradas; calendario tzolk\'in estructura navegación digital; tiempo lineal occidental sustituido por tiempo cíclico maya.',
    'Laboratorio Igbo de Semillas Ancestrales (Nigeria): bancos de semillas vivos en aldeas y universidades rurales; cada siembra es acto de memoria ancestral; agricultura resignificada como biotecnología del futuro.',
    'Ciudad Zapoteca del Viento (Oaxaca): urbe diseñada con aerogeneradores comunitarios; viento tratado como energía sagrada y voz política; tecnología eólica sin extractivismo verde.',
    'Ixmayel, Rectorx del Muxeverse (Zapoteca): descendiente zapoteca heredero de tradición muxe; rectorx de Universidad Interplanetaria del Istmo; dirige programas de derecho que obligan a corporaciones rendir cuentas a comunidades originarias.',
    'Sadia, Canciller de HijraNet (Sur de Asia): hijra vinculada a tradiciones rituales desde Mahabharata; canciller de Confederación del Sur Global; lidera tratados transcontinentales de redistribución energética.',
    'Wakinyan, Portavoz Two-Spirit (Lakota): retoma espiritualidad Two-Spirit precolonial; portavoz del Parlamento Planetario de Justicia Climática; articula demandas indígenas y queer en políticas ambientales obligatorias.',
    'Lagalaga, Ministra de Ciudades Oceánicas (Samoa): fa\'afafine heredera de identidad social reconocida históricamente; ministra de urbanismo y migraciones climáticas; diseña territorios flotantes para desplazadxs climáticxs.',
    'Bissu Kalla, Custodix del Archivo Mundial (Bugis): bissu bugis sacerdotx andrógino con rol ancestral; responsable del Archivo Mundial de la Humanidad; asegura memorias de pueblos en igualdad de acceso.',
    'Luna Travesti, Presidenta de la Red Andina (Argentina): activista travesti heredera de luchas del siglo XX; presidenta de Red Andina de Estados Comunitarios; impulsa constituciones que reconocen cuerpos trans y NB como patrimonio vivo.',
    'Bakla Reyes, Estratega de Comunicación Global (Filipinas): bakla filipinx figura reconocida antes de colonización española; estratega de comunicación en Asamblea General del Pluriverso; destruye hegemonía del inglés.',
    'Mahu Kealoha, Gobernadorx de Archipiélagos Educativos (Hawái): mahu kanaka maoli; gobernadorx de Archipiélagos Educativos del Pacífico; dirige sistema educativo interoceánico con universidades flotantes.',
    'Ardita, Hacker Burrnesha (Balcanes): descendiente de burrnesha balcánicas; hacker estatal y ministra de seguridad digital; desarrolla protocolos NB para proteger pueblos de vigilancia corporativa.',
    'AmaLisa, Copresidentx de Kanathari Cosmopolis (Benín): inspiradx en Mawu-Lisa, divinidad andrógina de Dahomey; copresidentx de Kanathari, ciudad africana del futuro; constitución que incluye perspectivas binarias y no binarias.',
    'Universidad Sami del Joik Climático (Escandinavia): joik controla meteorología urbana; cantos invocan paisajes como ciencia.',
    'Red Kikuyu de Árboles Sagrados (Kenia): árboles con sensores como asambleas; mugumo sagrado en governance ecológica espiritual.',
    'Archivo Corso de Voces de Mar (Mediterráneo): redes marítimas de canto polifónico; paghjella para gobernanza oceánica.',
    'Universidad Frisona de Agua (Países Bajos): pedagogía en ciudades flotantes; gestión colectiva de diques como educación hídrica.',
    'Cosmología Wolof de la Palabra (Senegal): redes sociales basadas en proverbios; oralidad proverbial como algoritmo digital.',
    'Archivo Sardo de la Murra (Cerdeña): juegos de cartas rituales como democracia digital; juego tradicional reinventado como política.',
    'Coro Occitano de Justicia (Francia): tribunales que deliberan cantando; canción trovadoresca como sistema judicial.',
    'Hospital Yoruba de Danza Egungun (Nigeria): medicina urbana con danzas holográficas; ancestros como médicos comunitarios.',
    'Archivo Sami de Renos Digitales (Escandinavia): GPS cultural guiado por renos holográficos; pastoreo ancestral como navegación digital.',
    'Arquitectura Catalana del Canto (Europa): edificios que cantan liturgias urbanas; Cant de la Sibil·la como arquitectura musical.',
  ];

  // 40 Essay titles (FR)
  const worldNamesFR = [
    "Université des Glaciers (Quechua + Sami) : campus construit dans des glaciers intelligents dialoguant avec capteurs climatiques ; femmes quechuas et sami enseignent épistémologies de glace ; science écrite depuis corps-territoires.",
    "Ville-Rivière (Nasa + Wolof + Catalans) : cité flottante dans cours d'eau sans murs, où l'eau définit l'urbanisme ; universités recherchent justice hydrique ; politique émerge de l'eau comme acteur principal.",
    "Plateforme Ñande (Guaraní + Igbo) : réseau numérique autonome avec serveurs solaires dans villages ; jeunes créent logiciels éducatifs en guaraní et igbo ; internet comme réseau de parenté, non marché.",
    "Métapolis du Maïs (Zapotèques + Ashanti) : ville verticale où maïs est structure architecturale et métaphore de code génétique ; bio-ingénieures communautaires éditent semences sans corporations ; biotechnologie sans extractivisme.",
    "Archipel de la Mémoire (Rarámuri + Bretons) : îles connectées par ponts de fibres optiques sous-marines ; universités archipel publient en langues locales et numériques ; mémoire non archivée, performée en réseau.",
    "Corps-Ville (Mapuche + Masaï) : villes construites comme anatomies géantes où rues sont veines d'énergie ; médecins-artistes enseignent médecine urbaine comme performance ; santé, art et urbanisme fusionnent.",
    "Observatoire de Papillons (Mixe + Touareg) : laboratoires mobiles suivant routes migratoires de papillons ; scientifiques développent météorologie avec algorithmes d'ailes ; science climatique non-anthropocentrique.",
    "Aurore Numérique (Sami + Quechua + Yoruba) : villes sous aurores boréales contrôlées par bio-algorithmes ; universités nocturnes donnent cours dans aurores projetées ; connaissance comme expérience immersive.",
    "Université Sous-marine (Shipibo + Igbo + Frisons) : campus sous-marin avec dômes translucides et coraux artificiels ; recherche en éthique océanique ; science marine avec cosmologie communautaire.",
    "Pangée Algorithmique Orale (Wolof + Basques) : réseaux urbains où proverbes gouvernent algorithmes ; programmeurs récitent sur places pour mettre à jour logiciels ; IA basée sur oralité, non données.",
    "Ville-Graine (Maya + Celtes) : bâtiments naissent comme graines et croissent avec habitants ; universités conçoivent architecture végétale comme curriculum ; urbanisme comme biologie sociale.",
    "Théâtre de Cristal (Corses + Yorubas) : salles d'art en verre vivant changeant selon émotions ; œuvres collectives où public modifie scène ; art comme interaction sensorielle.",
    "Réseau Lunaire (Aymara + Sardes + Gnawa) : colonies flottantes orbitant lunes artificielles ; universités enseignent astronomie comme politique ; cosmos comme sphère de coexistence.",
    "Hôpital de la Forêt Synthétique (Nasa + Kikuyu) : hôpitaux dans forêts hybrides d'arbres et biotechnologie ; médecins programment thérapies avec champignons cybernétiques ; médecine trans-espèces.",
    "Ville du Jeu (Rarámuri + Zulu + Catalans) : cité organisée en stades circulaires ; décisions politiques prises dans jeux collectifs ; démocratie comme jeu.",
    "Université du Lac Titicaca (Aymara + Quechua) : campus flottants construits par communautés aymara et quechua ; chaque début de cycle offre à l'eau comme sujet vivant ; première université transfrontalière créée par peuples originaires.",
    "Réseau Yoruba de Cosmopolitique Numérique (Nigéria/Bénin) : serveurs installés dans maisons-temples d'Ifá ; consultations d'Ifá traduites en algorithmes communautaires ; récupère autorité philosophique yoruba comme IA décoloniale.",
    "Villes du Blé (Basques + Sami) : villes du nord de l'Europe dans champs de blé gérés collectivement ; fêtes de récolte deviennent assemblées où terre vote ; peuples marginalisés européens comme concepteurs d'agro-villes.",
    "Archive Shipibo du Kené Numérique (Amazonie) : serveurs installés dans malocas ; ícaros enregistrés comme motifs numériques visuels ; esthétique shipibo reconnue comme épistémologie visuelle du 21ème siècle.",
    "Port Ashanti d'Or Numérique (Ghana) : marchés futuristes à Kumasi avec monnaies symboliques basées sur adinkra ; chaque transaction accompagnée de proverbes ; resignifie or comme support d'économie communautaire.",
    "Université Mapuche de Wallmapu (Chili/Argentine) : campus dispersé dans lof ruraux et villes ; cérémonies de nguillatun marquent rythmes du calendrier académique ; transforme éducation occidentale avec savoirs mapuche comme philosophie contemporaine.",
    "Parlement Touareg de Sable (Sahara) : dunes converties en agoras par hologrammes ; vents considérés comme conseillers politiques ; peuple déplacé par frontières réinvente politique nomade comme modèle global.",
    "Réseau Maya de Tzolk'in Virtuel (Mésoamérique) : serveurs solaires dans pyramides restaurées ; calendrier tzolk'in structure navigation numérique ; temps linéaire occidental remplacé par temps cyclique maya.",
    "Laboratoire Igbo de Graines Ancestrales (Nigéria) : banques de graines vivantes dans villages et universités rurales ; chaque plantation est acte de mémoire ancestrale ; agriculture resignifiée comme biotechnologie du futur.",
    "Ville Zapotèque du Vent (Oaxaca) : cité conçue avec aérogénérateurs communautaires ; vent traité comme énergie sacrée et voix politique ; technologie éolienne sans extractivisme vert.",
    "Ixmayel, Recteurice du Muxeverse (Zapotèque) : descendant zapotèque héritier de tradition muxe ; recteurice de l'Université Interplanétaire de l'Isthme ; dirige programmes de droit obligeant corporations à rendre comptes aux communautés originaires.",
    "Sadia, Chancelière de HijraNet (Asie du Sud) : hijra liée aux traditions rituelles depuis Mahabharata ; chancelière de Confédération du Sud Global ; mène traités transcontinentaux de redistribution énergétique.",
    "Wakinyan, Porte-parole Two-Spirit (Lakota) : reprend spiritualité Two-Spirit précoloniale ; porte-parole du Parlement Planétaire de Justice Climatique ; articule demandes indigènes et queer en politiques environnementales obligatoires.",
    "Lagalaga, Ministre des Villes Océaniques (Samoa) : fa'afafine héritière d'identité sociale historiquement reconnue ; ministre d'urbanisme et migrations climatiques ; conçoit territoires flottants pour déplacés climatiques.",
    "Bissu Kalla, Gardienne de l'Archive Mondiale (Bugis) : bissu bugis prêtresse androgyne au rôle ancestral ; responsable de l'Archive Mondiale de l'Humanité ; assure mémoires des peuples en égal accès au 22ème siècle.",
    "AmaLisa, Co-présidente de Kanathari Cosmopolis (Bénin) : co-présidente inspirée par Mawu-Lisa divinité androgyne du Dahomey ; dirige Kanathari, ville africaine du futur ; conçoit constitution obligeant toute politique à inclure perspectives binaires et non-binaires sans hiérarchie.",
    "Résonateur des Politiques du Corps : des technologies amplifient des vérités situées ; la chair devient syllabus, la sensation méthode, le consentement signal.",
    "Coffre de Données Décolonial : des communs chiffrés où la souveraineté est sacrée ; des permissions en cérémonies, chaque requête paie respect.",
    "Studio du Signal Subalterne : des toits-émetteurs qui font archive du rumeur ; des fréquences tressent des quartiers en sphère contre-publique.",
    "Commune Nuagique Zapatiste : un code qui obéit en commandant ensemble ; une infrastructure comme milpa — réciproque, résiliente, partagée.",
    "Sanctuaire Synthétique Pachamama : des interfaces informées par la terre accordent le progrès à la réciprocité ; l'informatique composte et revient en chant.",
    "Pont Quantique Diasporique : des portails cousus par mémoire ; mobilité sans déracinement, arrivée sans oubli.",
    "Interface Nepantla : conçue pour l'entre ; des contradictions non pas bugs mais ressources pour refus créatif et redesign.",
    "Archive des Avenirs : le temps gardé par les vulnérables ; le promis s'indexe, le dû devient imagination actionnable.",
    "Atelier d'Utopistique : des prototypes de politiques à tenir en main ; la critique itère en pratique, l'échec se métabolise en instruction.",
    "Place du Protocole de Libération : un standard ouvert pour la dignité ; une gouvernance lisible, forkable, redevable aux marges.",
    // 40 - 44 (Nouveaux)
    "Souverain·es du Non-Cartographié : sourires après la dé‑fabrication de l'Europe : couronnes en bio‑alliages, sceptres‑semences ; la royauté devient soin et la joie porte le savoir.",
    "Couronne de Multiples Rivières : royauté sans empire : rois et reines comme gardien·nes ; regalia de matières vivantes, cartes en communs, la piste légifère en 4/4.",
    "Les Cendres ne Gouvernent Pas : inquisition désapprise : habits recodés pour guérir ; couronnes qui abritent, bâtons qui réparent ; la mémoire du feu comme pare‑feu.",
    "La Papauté des Forêts qui n'a Jamais Conquis : cathédrales de mycélium abritent la parenté ; couronnes stabilisent des écosystèmes, sceptres sèment des jardins ; le soin est canon.",
    "Bauhaus Pur : Lumière Primaire, Forme Civique : cercle‑carré‑triangle comme grammaire civique, couleur primaire fonctionnelle, matériaux honnêtes, précision comme tendresse.",
  ];

  const worldNamesEN = [
    // 0 - 4
    'Glacier University (Quechua + Sami): campus built inside intelligent glaciers dialoguing with climate sensors; Quechua and Sami women teach ice epistemologies; science written from body-territories.',
    'River-City (Nasa + Wolof + Catalans): floating city in waterways without walls, where water defines urbanism; universities research water justice; politics emerges from water as main actor.',
    'Ñande Platform (Guaraní + Igbo): autonomous digital network with solar servers in villages; youth create educational software in Guaraní and Igbo; internet as kinship network, not market.',
    'Corn Metapolis (Zapotecs + Ashanti): vertical city where corn is architectural structure and genetic code metaphor; community bioengineers edit seeds without corporations; biotechnology without extractivism.',
    'Memory Archipelago (Rarámuri + Bretons): islands connected by submarine fiber optic bridges; archipelago universities publish in local and digital languages; memory not archived, performed in network.',
    'Body-City (Mapuche + Masái): cities built as giant anatomies where streets are energy veins; doctor-artists teach urban medicine as performance; health, art and urbanism fuse.',
    'Butterfly Observatory (Mixe + Tuareg): mobile laboratories following butterfly migratory routes; scientists develop meteorology with wing algorithms; non-anthropocentric climate science.',
    'Digital Aurora (Sami + Quechua + Yoruba): cities under northern lights controlled with bioalgorithms; night universities teach classes in projected auroras; knowledge as immersive experience.',
    'Underwater University (Shipibo + Igbo + Frisians): underwater campus with translucent domes and artificial corals; research in oceanic ethics; marine science with community cosmology.',
    'Oral Algorithmic Pangea (Wolof + Basques): urban networks where proverbs govern algorithms; programmers recite in squares to update software; AI based on orality, not data.',
    // 10 - 14
    'Seed-City (Maya + Celts): buildings born as seeds and grow with inhabitants; universities design vegetal architecture as curriculum; urbanism as social biology.',
    'Crystal Theater (Corsicans + Yorubas): living glass art halls changing with emotions; collective works where audience modifies stage; art as sensorial interaction.',
    'Lunar Network (Aymara + Sardinians + Gnawa): floating colonies orbiting artificial moons; universities teach astronomy as politics; cosmos as sphere of coexistence.',
    'Synthetic Forest Hospital (Nasa + Kikuyu): hospitals in hybrid forests of trees and biotechnology; doctors program therapies with cybernetic fungi; trans-species medicine.',
    'Game City (Rarámuri + Zulu + Catalans): city organized in circular stadiums; political decisions made in collective games; democracy as play.',
    'Lake Titicaca University (Aymara + Quechua): floating campuses built by Aymara and Quechua communities; each cycle beginning offers to water as living subject; first transborder university created by original peoples.',
    'Yoruba Digital Cosmopolitics Network (Nigeria/Benin): servers installed in Ifá temple-houses; Ifá consultations translated into community algorithms; recovers Yoruba philosophical authority as decolonial AI.',
    'Wheat Cities (Basques + Sami): cities in northern Europe on collectively managed wheat fields; harvest festivals become assemblies where land votes; marginalized European peoples as designers of agro-cities.',
    'Shipibo Kené Digital Archive (Amazonia): servers installed in malocas; ícaros recorded as visual digital patterns; Shipibo aesthetics recognized as 21st century visual epistemology.',
    'Ashanti Digital Gold Port (Ghana): futurist markets in Kumasi with symbolic currencies based on adinkra; each transaction accompanied by proverbs; resignifies gold as community economy support.',
    // 20 - 24
    'Mapuche University of Wallmapu (Chile/Argentina): campus dispersed in rural lof and cities; nguillatun ceremonies mark academic calendar rhythms; transforms Western education with Mapuche knowledge as contemporary philosophy.',
    'Tuareg Sand Parliament (Sahara): dunes converted into agoras through holograms; winds considered political advisors; people displaced by borders reinvent nomadic politics as global model.',
    'Maya Tzolk\'in Virtual Network (Mesoamerica): solar servers in restored pyramids; tzolk\'in calendar structures digital navigation; Western linear time replaced by Maya cyclical time.',
    'Igbo Ancestral Seeds Laboratory (Nigeria): living seed banks in villages and rural universities; each planting is act of ancestral memory; agriculture resignified as future biotechnology.',
    'Zapotec Wind City (Oaxaca): city designed with community wind generators; wind treated as sacred energy and political voice; wind technology without green extractivism.',
    'Ixmayel, Rectorx of Muxeverse (Zapotec): Zapotec descendant heir of muxe tradition; rectorx of Interplanetary University of Isthmus; directs law programs forcing corporations to be accountable to original communities.',
    'Sadia, Chancellor of HijraNet (South Asia): hijra linked to ritual traditions since Mahabharata; chancellor of Global South Confederation; leads transcontinental energy redistribution treaties.',
    'Wakinyan, Two-Spirit Spokesperson (Lakota): retakes precolonial Two-Spirit spirituality; spokesperson of Planetary Parliament of Climate Justice; articulates indigenous and queer demands in mandatory environmental policies.',
    'Lagalaga, Minister of Oceanic Cities (Samoa): fa\'afafine heir of historically recognized social identity; minister of urbanism and climate migrations; designs floating territories for climate displaced.',
    'Bissu Kalla, Custodian of World Archive (Bugis): bissu bugis androgynous priest with ancestral role; responsible for World Archive of Humanity; ensures peoples\' memories in equal access.',
    'AmaLisa, Co-president of Kanathari Cosmopolis (Benin): co-president inspired by Mawu-Lisa androgynous divinity of Dahomey; leads Kanathari, African city of the future; designs constitution obliging all politics to include binary and non-binary perspectives without hierarchy.',
    'Tuareg Sand Parliament (Sahara): dunes converted to holographic agoras; winds as political advisors; nomadic politics as global model.',
    'Maya Virtual Tzolk\'in Network (Mesoamerica): solar servers in pyramids; calendar structures digital navigation; cyclical time as internet base.',
    'Igbo Ancestral Seeds Laboratory (Nigeria): living seed banks; agriculture resignified as biotechnology of the future.',
    'Zapotec Wind City (Oaxaca): city with community wind generators; wind as sacred energy; wind technology without extractivism.',
    'Sami Climatic Joik University (Scandinavia): joik controls urban meteorology; chants invoke landscapes as science.',
    'Kikuyu Sacred Trees Network (Kenya): trees with sensors as assemblies; sacred mugumo in spiritual ecological governance.',
    'Corsican Sea Voices Archive (Mediterranean): maritime networks of polyphonic song; paghjella for oceanic governance.',
    'Frisian Water University (Netherlands): pedagogy in floating cities; collective dike management as water education.',
    'Wolof Cosmology of the Word (Senegal): social networks based on proverbs; proverbial orality as digital algorithm.',
    'Sardinian Murra Archive (Sardinia): ritual card games as digital democracy; traditional game reinvented as politics.',
    // 40 - 44 (New)
    'Occitan Justice Choir (France): tribunals that deliberate singing; troubadour song as judicial system.',
    'Yoruba Egungun Dance Hospital (Nigeria): urban medicine with holographic dances; ancestors as community doctors.',
    'Sami Digital Reindeer Archive (Scandinavia): cultural GPS guided by holographic reindeer; ancestral herding as digital navigation.',
    'Catalan Song Architecture (Europe): buildings that sing urban liturgies; Cant de la Sibil·la as musical architecture.',
  ];

  // Runtime translation helpers (lightweight, preserves key terms)
  const translateText = (text: string, to: 'es' | 'fr' | 'de' | 'tr'): string => {
    const preserve = 'pueblos originarios';
    const token = '__PRESERVE__';
    let t = text.replace(new RegExp(preserve, 'gi'), token);
    const rules: Record<'es' | 'fr' | 'de' | 'tr', Array<[RegExp, string]>> = {
      es: [
        [/hyperrealistic/gi, 'hiperrealista'],
        [/ONE human body/gi, 'UN cuerpo humano'],
        [/ of /gi, ' de '],
        [/ of$/gi, ' de'],
        [/ where /gi, ' donde '],
        [/ becomes /gi, ' se vuelve '],
        [/ become /gi, ' se vuelve '],
        [/ to /gi, ' a '],
        [/ into /gi, ' en '],
        [/ from /gi, ' desde '],
        [/ by /gi, ' por '],
        [/simple/gi, 'simple'],
        [/background/gi, 'fondo'],
        [/lighting/gi, 'iluminación'],
        [/dramatic/gi, 'dramática'],
        [/cinematic/gi, 'cinematográfica'],
        [/photorealistic details/gi, 'detalles fotorrealistas'],
        [/floating/gi, 'flotantes'],
        [/glowing/gi, 'brillantes'],
        [/holographic/gi, 'holográfico'],
        [/with/gi, 'con'],
        [/and/gi, 'y'],
        [/honoring/gi, 'honrando'],
      ],
      fr: [
        [/hyperrealistic/gi, 'hyperréaliste'],
        [/ONE human body/gi, 'UN corps humain'],
        [/ of /gi, ' de '],
        [/ of$/gi, ' de'],
        [/ where /gi, ' où '],
        [/ becomes /gi, ' devient '],
        [/ become /gi, ' devenir '],
        [/ to /gi, ' à '],
        [/ into /gi, ' en '],
        [/ from /gi, ' depuis '],
        [/ by /gi, ' par '],
        [/simple/gi, 'simple'],
        [/background/gi, 'arrière-plan'],
        [/lighting/gi, 'éclairage'],
        [/dramatic/gi, 'dramatique'],
        [/cinematic/gi, 'cinématographique'],
        [/photorealistic details/gi, 'détails photoréalistes'],
        [/floating/gi, 'flottants'],
        [/glowing/gi, 'lumineux'],
        [/holographic/gi, 'holographique'],
        [/with/gi, 'avec'],
        [/and/gi, 'et'],
        [/honoring/gi, 'honorant'],
      ],
      de: [
        [/hyperrealistic/gi, 'hyperrealistisch'],
        [/ONE human body/gi, 'EIN menschlicher Körper'],
        [/ of /gi, ' von '],
        [/ of$/gi, ' von'],
        [/ where /gi, ' wo '],
        [/ becomes /gi, ' wird '],
        [/ become /gi, ' werden '],
        [/ to /gi, ' zu '],
        [/ into /gi, ' in '],
        [/ from /gi, ' aus '],
        [/ by /gi, ' von '],
        [/simple/gi, 'einfach'],
        [/background/gi, 'Hintergrund'],
        [/lighting/gi, 'Beleuchtung'],
        [/dramatic/gi, 'dramatisch'],
        [/cinematic/gi, 'filmisch'],
        [/photorealistic details/gi, 'fotorealistische Details'],
        [/floating/gi, 'schwebend'],
        [/glowing/gi, 'leuchtend'],
        [/holographic/gi, 'holografisch'],
        [/with/gi, 'mit'],
        [/and/gi, 'und'],
        [/honoring/gi, 'zur Ehrung'],
      ],
      tr: [
        [/hyperrealistic/gi, 'hiper gerçekçi'],
        [/ONE human body/gi, 'BİR insan vücudu'],
        [/ of /gi, ' '],
        [/ of$/gi, ''],
        [/ where /gi, ' nerede '],
        [/ becomes /gi, ' olur '],
        [/ become /gi, ' olmak '],
        [/ to /gi, ' '],
        [/ into /gi, ' içine '],
        [/ from /gi, ' dan '],
        [/ by /gi, ' tarafından '],
        [/simple/gi, 'basit'],
        [/background/gi, 'arka plan'],
        [/lighting/gi, 'aydınlatma'],
        [/dramatic/gi, 'dramatik'],
        [/cinematic/gi, 'sinematik'],
        [/photorealistic details/gi, 'foto-gerçekçi detaylar'],
        [/floating/gi, 'yüzen'],
        [/glowing/gi, 'parlayan'],
        [/holographic/gi, 'holografik'],
        [/with/gi, 'ile'],
        [/and/gi, 've'],
        [/honoring/gi, 'onurlandırarak'],
      ],
    };
    for (const [re, rep] of rules[to]) t = t.replace(re, rep);
    return t.replace(new RegExp(token, 'g'), preserve);
  };

  const translateName = (name: string, to: 'es' | 'fr' | 'de' | 'tr'): string => {
    const rules: Record<'es' | 'fr' | 'de' | 'tr', Array<[RegExp, string]>> = {
      es: [
        [/Assembly/gi, 'Asamblea'], [/Commons/gi, 'Comunal'], [/Agora/gi, 'Ágora'],
        [/Mesh/gi, 'Malla'], [/Garden/gi, 'Jardín'], [/Forge/gi, 'Forja'],
        [/Observatory/gi, 'Observatorio'], [/Lab(?![a-z])/gi, 'Laboratorio'],
        [/Constellation/gi, 'Constelación'], [/Atrium/gi, 'Atrio'], [/Resonator/gi, 'Resonador'],
        [/Datavault/gi, 'Bóveda de Datos'], [/Studio/gi, 'Estudio'], [/Commune/gi, 'Comuna'],
        [/Sanctuary/gi, 'Santuario'], [/Bridge/gi, 'Puente'], [/Interface/gi, 'Interfaz'],
        [/Archive/gi, 'Archivo'], [/Workshop/gi, 'Taller'], [/Plaza/gi, 'Plaza'], [/Utopias?/gi, 'Utopías'],
      ],
      fr: [
        [/Assembly/gi, 'Assemblée'], [/Commons/gi, 'Commun'], [/Agora/gi, 'Agora'],
        [/Mesh/gi, 'Maillage'], [/Garden/gi, 'Jardin'], [/Forge/gi, 'Forge'],
        [/Observatory/gi, 'Observatoire'], [/Lab(?![a-z])/gi, 'Laboratoire'],
        [/Constellation/gi, 'Constellation'], [/Atrium/gi, 'Atrium'], [/Resonator/gi, 'Résonateur'],
        [/Datavault/gi, 'Coffre de Données'], [/Studio/gi, 'Studio'], [/Commune/gi, 'Commune'],
        [/Sanctuary/gi, 'Sanctuaire'], [/Bridge/gi, 'Pont'], [/Interface/gi, 'Interface'],
        [/Archive/gi, 'Archive'], [/Workshop/gi, 'Atelier'], [/Plaza/gi, 'Place'], [/Utopias?/gi, 'Utopies'],
      ],
      de: [
        [/Assembly/gi, 'Versammlung'], [/Commons/gi, 'Allmende'], [/Agora/gi, 'Agora'],
        [/Mesh/gi, 'Netz'], [/Garden/gi, 'Garten'], [/Forge/gi, 'Schmiede'],
        [/Observatory/gi, 'Observatorium'], [/Lab(?![a-z])/gi, 'Labor'],
        [/Constellation/gi, 'Konstellation'], [/Atrium/gi, 'Atrium'], [/Resonator/gi, 'Resonator'],
        [/Datavault/gi, 'Datengewölbe'], [/Studio/gi, 'Studio'], [/Commune/gi, 'Kommune'],
        [/Sanctuary/gi, 'Heiligtum'], [/Bridge/gi, 'Brücke'], [/Interface/gi, 'Schnittstelle'],
        [/Archive/gi, 'Archiv'], [/Workshop/gi, 'Werkstatt'], [/Plaza/gi, 'Platz'], [/Utopias?/gi, 'Utopien'],
      ],
      tr: [
        [/Assembly/gi, 'Meclis'], [/Commons/gi, 'Ortak'], [/Agora/gi, 'Agora'],
        [/Mesh/gi, 'Ağ'], [/Garden/gi, 'Bahçe'], [/Forge/gi, 'Demirci'],
        [/Observatory/gi, 'Gözlemevi'], [/Lab(?![a-z])/gi, 'Laboratuvar'],
        [/Constellation/gi, 'Takımyıldız'], [/Atrium/gi, 'Avlu'], [/Resonator/gi, 'Rezonatör'],
        [/Datavault/gi, 'Veri Kasası'], [/Studio/gi, 'Stüdyo'], [/Commune/gi, 'Komün'],
        [/Sanctuary/gi, 'Sığınak'], [/Bridge/gi, 'Köprü'], [/Interface/gi, 'Arayüz'],
        [/Archive/gi, 'Arşiv'], [/Workshop/gi, 'Atölye'], [/Plaza/gi, 'Meydan'], [/Utopias?/gi, 'Ütopyalar'],
      ],
    };
    let t = name;
    for (const [re, rep] of rules[to]) t = t.replace(re, rep);
    return t;
  };

  // Prompts by language
  const promptsByLang: Record<'en' | 'es' | 'fr' | 'de' | 'pt' | 'tr', string[]> = {
    en: worldPromptsEN,
    es: worldPromptsES,
    fr: worldPromptsFR,
    de: worldPromptsDE,
    pt: worldPromptsPT,
    tr: [
      'Peru Amazonya\'sından Shipibo-Konibo topluluklarından, hiper gerçekçi BİR insan vücudu, interaktif ekranlar olarak işlev gören kené desenleriyle işlenmiş giysiler giyen, vizyoner geometrilerde titreşen duvarları olan yüzen Amazon şehri arka planı, doğal ve teknolojik aydınlatma birleşimi, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Nijerya ve Benin\'den Yoruba topluluklarından, hiper gerçekçi BİR insan vücudu, atasözlerini saklayan sözlü bellek sensörlü sarıklar taşıyan, Ifá\'nın 256 odù\'sünü gösteren ekranlarla gelecekçi Lagos\'ta, sıcak altın aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'İskandinavya\'dan Sami topluluklarından, hiper gerçekçi BİR insan vücudu, yansıtıcı fiberli polar takımları içinde, geyik ve Arktik manzara hologramları belirirken joik söyleyen, kuzey ışıkları olan Tromsø arka planı, Arktik doğal aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Mezoamerika\'dan Maya topluluklarından, hiper gerçekçi BİR insan vücudu, kutsal günlere göre renk değiştiren mikroçipli huipiller giyen, Maya döngüsel zamanını işaretleyen ekranlarla Mérida\'da, tören aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Fas\'tan Gnawa topluluklarından, hiper gerçekçi BİR insan vücudu, metalik krakebs ritmiyle titreşen tunikler, hastanelerin günlerini gnawa lila ile başlattığı Kazablanka\'da, sıcak sabah aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Sierra Tarahumara\'dan Rarámuri topluluklarından, hiper gerçekçi BİR insan vücudu, çevresel sensörler donanımlı sandaletlerle koşan, hava ve su kalitesini ölçen, ışıklı dijital patikalarla Meksika dağları arka planı, doğal dağ aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Gana\'dan Ashanti topluluklarından, hiper gerçekçi BİR insan vücudu, eylemlere göre adinkra sembolleri yansıtan holografik bileklikler taşıyan, etik interaktif sembollerle kaplı binalar olan Accra\'da, altın Afrika aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Peru And Dağları\'ndan Quechua topluluklarından, hiper gerçekçi BİR insan vücudu, kuantum işlemci olarak işlev gören dijital quipular dokuyun, ışıklı ağaçlar gibi asılı veri ipleri olan Cusco\'da, And altın aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Namibya\'dan Himba topluluklarından, hiper gerçekçi BİR insan vücudu, kolektif duygulara göre renk değiştiren biyoteknolojik kızıl toprak kaplı deri, Kaokoland topluluk meclislerinde, sıcak çöl aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'İrlanda ve İskoçya\'dan Kelt topluluklarından, hiper gerçekçi BİR insan vücudu, güneş döngüleriyle parlayan ışıklı fiber giysiler, rituel güneş panelleri olan Dublin\'de Samhain kutlarken, Kelt festival aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Quechua-Sami topluluklarından, hiper gerçekçi BİR insan vücudu, akıllı buzullarda buz epistemolojileri öğreten kadınlar, vücut-toprak bilimi yazılan buzul kampüs arka planı, buzul doğal aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Nasa-Wolof-Katalan topluluklarından, hiper gerçekçi BİR insan vücudu, su adaleti araştıran üniversiteler olan yüzen şehirde, suyun şehirciliği tanımladığı yerde, su aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Guaraní-Igbo topluluklarından, hiper gerçekçi BİR insan vücudu, güneş sunuculu özerk dijital ağda, Guaraní ve Igbo dillerinde eğitim yazılımı olan, akrabalık ağı olarak internet arka planı, dijital aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Zapoteca-Ashanti topluluklarından, hiper gerçekçi BİR insan vücudu, mısırı yapı olarak kullanan dikey şehirde, şirket olmadan tohumları düzenleyen biyo-mühendis topluluklar, çıkarcılık olmayan biyoteknoloji arka planı, yeşil aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Rarámuri-Breton topluluklarından, hiper gerçekçi BİR insan vücudu, denizaltı fiberleriyle bağlı adalarda, yerel dillerde yayın yapan üniversiteler, ağda performans olarak hafıza arka planı, ada aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Mapuche-Masai topluluklarından, hiper gerçekçi BİR insan vücudu, dev anatomiler olarak inşa edilen şehirlerde, kentsel tıp öğreten doktor-sanatçılar, sağlık-sanat-şehircilik birleşimi arka planı, organik aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Mixe-Tuareg topluluklarından, hiper gerçekçi BİR insan vücudu, göç rotalarını takip eden mobil laboratuvarlarda, kanat algoritmalarıyla meteoroloji geliştiren bilimciler, göçmen aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Sami-Quechua-Yoruba topluluklarından, hiper gerçekçi BİR insan vücudu, biyo-algoritmalarla kontrol edilen kutup ışıkları altında, yansıtılan kutup ışıklarında gece üniversiteleri, kutup ışığı aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Shipibo-Igbo-Frizyalı topluluklarından, hiper gerçekçi BİR insan vücudu, saydam kubbeli sualtı kampüsünde, kené desenli amfibi takımlar, okyanus etiği araştırması arka planı, sualtı aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Wolof-Bask topluluklarından, hiper gerçekçi BİR insan vücudu, atasözlerinin algoritmaları yönettiği yerde, meydanlarda ezber okuyan programcılar, veri değil sözlülük tabanlı AI arka planı, meydan aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Maya-Kelt topluluklarından, hiper gerçekçi BİR insan vücudu, tohum gibi büyüyen binalar, bitki mimarisi tasarlayan üniversiteler, sosyal biyoloji olarak şehircilik arka planı, organik büyüme aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Korsikalı-Yoruba topluluklarından, hiper gerçekçi BİR insan vücudu, duygularla değişen yaşayan cam salonlarda, izleyicinin sahneyi değiştirdiği kolektif eserler, kristal tiyatro arka planı, değişken aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Aymara-Sardinyalı-Gnawa topluluklarından, hiper gerçekçi BİR insan vücudu, yapay ayları çevreleyen yüzen kolonilerde, astronomik siyaset öğreten üniversiteler, ay ağı arka planı, ay aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Nasa-Kikuyu topluluklarından, hiper gerçekçi BİR insan vücudu, hibrit ormanlarda, sibernetik mantarlarla tedavi programlayan doktorlar, sentetik orman hastanesi arka planı, orman-teknoloji aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Rarámuri-Zulu-Katalan topluluklarından, hiper gerçekçi BİR insan vücudu, dairesel stadyumlarda organize şehirde, kolektif oyunlarda siyasi kararlar alan, oyun demokrasisi arka planı, stadyum aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Aymara-Quechua topluluklarından, hiper gerçekçi BİR insan vücudu, topluluklar tarafından yaratılan yüzen kampüste, akademik takvimleri belirleyen göller, ilk sınıraşan üniversite arka planı, göl aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Nijerya-Benin Yoruba topluluklarından, hiper gerçekçi BİR insan vücudu, Ifá tapınak-evlerinde sunucular, topluluk algoritmalarına çevrilen danışmalar, dijital kozmopolitika arka planı, tapınak aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Bask-Sami topluluklarından, hiper gerçekçi BİR insan vücudu, kolektif yönetilen tarlalarda şehirler, toprağın oy verdiği meclis olarak hasat festivalleri, buğday şehirleri arka planı, hasat aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Amazon Shipibo topluluklarından, hiper gerçekçi BİR insan vücudu, malocalarda sunucular, görsel desenler olarak kaydedilen ícarolar, estetik epistemoloji arka planı, Amazon dijital aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Gana Ashanti topluluklarından, hiper gerçekçi BİR insan vücudu, adinkra tabanlı para birimlerinin olduğu pazarlarda, topluluk ekonomisi olarak yeniden anlamlandırılan geri dönüştürülmüş altın, dijital altın limanı arka planı, altın pazar aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Şili-Arjantin Mapuche topluluklarından, hiper gerçekçi BİR insan vücudu, lof\'lara dağılmış kampüste, akademik ritimleri belirleyen nguillatun, çağdaş felsefe olarak Mapuche bilgisi arka planı, lof aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Sahra Tuareg topluluklarından, hiper gerçekçi BİR insan vücudu, holografik agoralara dönüştürülen kum tepelerinde, siyasi danışman olarak rüzgarlar, küresel model olarak göçebe siyaset arka planı, çöl hologram aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Mezoamerika Maya topluluklarından, hiper gerçekçi BİR insan vücudu, piramitlerde güneş sunucuları, dijital navigasyonu yapılandıran takvim, internet temeli olarak döngüsel zaman arka planı, piramit güneş aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Nijerya Igbo topluluklarından, hiper gerçekçi BİR insan vücudu, yaşayan tohum bankalarında, geleceğin biyoteknolojisi olarak yeniden anlamlandırılan tarım, atalar tohumları arka planı, yeşil biyoteknoloji aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Oaxaca Zapoteca topluluklarından, hiper gerçekçi BİR insan vücudu, topluluk rüzgar jeneratörlü şehirde, kutsal enerji olarak rüzgar, çıkarcılık olmadan rüzgar teknolojisi arka planı, rüzgar enerjisi aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'İskandinavya Sami topluluklarından, hiper gerçekçi BİR insan vücudu, kentsel meteorolojiyi kontrol eden joik, manzaraları bilim olarak çağıran ilahiler, iklimsel joik arka planı, atmosferik aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Kenya Kikuyu topluluklarından, hiper gerçekçi BİR insan vücudu, meclis olarak sensörlü ağaçlar, ruhsal ekolojik yönetişimde kutsal mugumo, kutsal ağaçlar ağı arka planı, doğal ekolojik aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Akdeniz Korsika topluluklarından, hiper gerçekçi BİR insan vücudu, çok sesli şarkının denizci ağları, okyanus yönetişimi için paghjella, deniz sesleri arşivi arka planı, denizci aydınlatma, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Hollanda Frizya topluluklarından, hiper gerçekçi BİR insan vücudu, yüzen şehirlerde pedagoji, su eğitimi olarak kolektif bent yönetimi, su üniversitesi arka planı, su pedagojisi aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Senegal Wolof topluluklarından, hiper gerçekçi BİR insan vücudu, atasözü tabanlı sosyal ağlarda, dijital algoritma olarak atasözü sözlülüğü, söz kozmolojisi arka planı, sözlü gelenek aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Sardinya topluluklarından, hiper gerçekçi BİR insan vücudu, dijital demokrasi olarak rituel kart oyunları, siyaset olarak yeniden icat edilen geleneksel oyun, murra arşivi arka planı, oyun demokrasisi aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Fransa Oksitan topluluklarından, hiper gerçekçi BİR insan vücudu, şarkı söyleyerek müzakere eden mahkemelerde, yargı sistemi olarak trubadur şarkısı, adalet korosu arka planı, adalet müziği aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Nijerya Yoruba topluluklarından, hiper gerçekçi BİR insan vücudu, holografik danslarla kentsel tıp, topluluk doktoru olarak atalar, egungun dans hastanesi arka planı, şifa dansı aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'İskandinavya Sami topluluklarından, hiper gerçekçi BİR insan vücudu, holografik ren geyikleri tarafından yönlendirilen kültürel GPS, dijital navigasyon olarak atalardan gelen çobanlık, dijital ren geyiği arka planı, kültürel navigasyon aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios',
      'Avrupa Katalan topluluklarından, hiper gerçekçi BİR insan vücudu, kentsel liturjileri söyleyen binalar, müzikal mimari olarak Cant de la Sibil·la, şarkı mimarisi arka planı, mimari müzik aydınlatması, 8K foto-gerçekçi detaylar, honrando pueblos originarios'
    ]
  };

  const currentPrompts = promptsByLang[lang] ?? promptsByLang.en;

  // Names by language
  const namesByLang: Record<'en' | 'es' | 'fr' | 'de' | 'pt' | 'tr', string[]> = {
    en: worldNamesEN,
    es: worldNamesES,
    fr: worldNamesFR,
    de: worldNamesDE,
    pt: worldNamesPT,
    tr: [
      'Buzullar Üniversitesi (Quechua + Sami): iklim sensörleriyle diyalog kuran akıllı buzullar içinde inşa edilmiş kampüs; Quechua ve Sami kadınları buz epistemolojileri öğretir; bilim vücut-topraklardan yazılır.',
      'Nehir-Şehir (Nasa + Wolof + Katalanlar): duvarları olmayan su yataklarında yüzen şehir, suyun şehirciliği tanımladığı yer; üniversiteler su adaletini araştırır; siyaset suyun ana aktör olarak ortaya çıkması.',
      'Ñande Platformu (Guaraní + Igbo): köylerde güneş sunuculu özerk dijital ağ; gençler Guaraní ve Igbo dillerinde eğitim yazılımı yaratır; internet pazar değil akrabalık ağı olarak.',
      'Mısır Metapolisi (Zapotekler + Ashanti): mısırın mimari yapı ve genetik kod metaforu olduğu dikey şehir; topluluk biyo-mühendisleri korporasyonlar olmadan tohum düzenler; çıkarcılık olmadan biyoteknoloji.',
      'Hafıza Takımadası (Rarámuri + Bretonlar): denizaltı fiber optik köprülerle bağlanan adalar; takımada üniversiteleri yerel ve dijital dillerde yayın yapar; hafıza arşivlenmez, ağda performans olur.',
      'Vücut-Şehir (Mapuche + Masai): sokakların enerji damarları olduğu dev anatomiler olarak inşa edilen şehirler; doktor-sanatçılar kentsel tıbbı performans olarak öğretir; sağlık, sanat ve şehircilik birleşir.',
      'Kelebek Gözlemevi (Mixe + Tuareg): kelebek göç rotalarını takip eden mobil laboratuvarlar; bilimciler kanat algoritmalarıyla meteoroloji geliştirir; antroposantrik olmayan iklim bilimi.',
      'Dijital Aurora (Sami + Quechua + Yoruba): biyo-algoritmalarla kontrol edilen kutup ışıkları altında şehirler; gece üniversiteleri yansıtılan auroralarda ders verir; bilgi sürükleyici deneyim olarak.',
      'Sualtı Üniversitesi (Shipibo + Igbo + Frizyalılar): şeffaf kubbeli ve yapay mercanları olan sualtı kampüsü; okyanus etiği araştırması; topluluk kozmolojisiyle deniz bilimi.',
      'Sözlü Algoritmik Pangea (Wolof + Basklar): atasözlerinin algoritmaları yönettiği kentsel ağlar; programcılar yazılımı güncellemek için meydanlarda ezber okur; veriye değil sözlülüğe dayalı AI.',
      'Tohum-Şehir (Maya + Keltler): tohum olarak doğan ve sakinlerle birlikte büyüyen binalar; üniversiteler bitki mimarisini müfredat olarak tasarlar; şehircilik sosyal biyoloji olarak.',
      'Kristal Tiyatro (Korsikalılar + Yorubalar): duygulara göre değişen yaşayan cam sanat salonları; izleyicinin sahneyi değiştirebildiği kolektif eserler; sanat duyusal etkileşim olarak.',
      'Ay Ağı (Aymara + Sardinyalılar + Gnawa): yapay ayları çevreleyen yüzen koloniler; üniversiteler astronomiyi siyaset olarak öğretir; kozmos birlikte yaşama alanı olarak.',
      'Sentetik Orman Hastanesi (Nasa + Kikuyu): ağaçlar ve biyoteknolojinin hibrit ormanlarında hastaneler; doktorlar sibernetik mantarlarla tedaviler programlar; türlerarası tıp.',
      'Oyun Şehri (Rarámuri + Zulu + Katalanlar): dairesel stadyumlarda örgütlenmiş şehir; siyasi kararlar kolektif oyunlarda alınır; demokrasi oyun olarak.',
      'Titicaca Gölü Üniversitesi (Aymara + Quechua): Aymara ve Quechua toplulukları tarafından inşa edilen yüzen kampüsler; her dönemin başında suya yaşayan özne olarak adak verilir; özgün halklar tarafından yaratılan ilk sınıraşan üniversite.',
      'Yoruba Dijital Kozmopolitika Ağı (Nijerya/Benin): Ifá tapınak-evlerine kurulan sunucular; Ifá danışmaları topluluk algoritmalarına çevrilir; Yoruba felsefi otoritesini dekolonyal AI olarak geri kazanır.',
      'Buğday Şehirleri (Basklar + Sami): kuzey Avrupa\'da kolektif yönetilen buğday tarlalarında şehirler; hasat festivalleri toprağın oy verdiği meclislere dönüşür; Avrupa\'da marjinalleşen halklar agro-şehirlerin tasarımcıları olarak.',
      'Shipibo Kené Dijital Arşivi (Amazonya): malocalara kurulan sunucular; ícarolar görsel dijital desenler olarak kaydedilir; Shipibo estetiği 21. yüzyıl görsel epistemolojisi olarak tanınır.',
      'Ashanti Dijital Altın Limanı (Gana): Kumasi\'de adinkra tabanlı sembolik para birimleriyle fütürist pazarlar; her işlem atasözleriyle eşlik edilir; altını topluluk ekonomisinin desteği olarak yeniden anlamlandırır.',
      'Wallmapu Mapuche Üniversitesi (Şili/Arjantin): kırsal lof ve şehirlere dağılmış kampüs; nguillatun törenleri akademik takvim ritimlerini belirler; Batı eğitimini çağdaş felsefe olarak Mapuche bilgisiyle dönüştürür.',
      'Tuareg Kum Parlamentosu (Sahra): hologramlarla agoralara dönüştürülen kum tepeleri; rüzgarlar siyasi danışman olarak kabul edilir; sınırlarla yerinden edilen halk göçebe siyaseti küresel model olarak yeniden icat eder.',
      'Maya Tzolk\'in Sanal Ağı (Mezoamerika): restore edilmiş piramitlerde güneş sunucuları; tzolk\'in takvimi dijital navigasyonu yapılandırır; Batı doğrusal zamanı Maya döngüsel zamanıyla değiştirilir.',
      'Igbo Atalar Tohumları Laboratuvarı (Nijerya): köylerde ve kırsal üniversitelerde yaşayan tohum bankaları; her ekim atalar hafızasının bir eylem; tarım geleceğin biyoteknolojisi olarak yeniden anlamlandırılır.',
      'Zapoteca Rüzgar Şehri (Oaxaca): topluluk rüzgar jeneratörleriyle tasarlanmış şehir; rüzgar kutsal enerji ve siyasi ses olarak kabul edilir; yeşil çıkarcılık olmadan rüzgar teknolojisi.',
      'Ixmayel, Muxeverse Rektörü (Zapoteca): muxe geleneğinin varisi Zapoteca soyundan; Kıstağın Gezegenlerarası Üniversitesi rektörü; korporasyonları özgün topluluklara hesap vermeye zorlayan hukuk programları yönetir.',
      'Sadia, HijraNet Şansölyesi (Güney Asya): Mahabharata\'dan beri rituel geleneklere bağlı hijra; Küresel Güney Konfederasyonu şansölyesi; hijra kutsamalarından ilham alan dijital protokollar kullanarak kıtalararası enerji yeniden dağıtım antlaşmaları yönetir.',
      'Wakinyan, Two-Spirit Sözcüsü (Lakota): öncesi sömürge Two-Spirit ruhsallığını yeniden benimser; Gezegen İklim Adaleti Parlamentosu sözcüsü; zorunlu çevre politikalarında yerli ve queer talepleri artiküle eder.',
      'Lagalaga, Okyanus Şehirleri Bakanı (Samoa): tarihsel olarak tanınan sosyal kimliğin varisi fa\'afafine; şehircilik ve iklim göçleri bakanı; iklim yerinden edilmiş milyonlar için yüzen bölgeler tasarlar.',
      'Bissu Kalla, Dünya Arşivi Koruyucusu (Bugis): atalar rolü olan bissu bugis androjen rahip; İnsanlık Dünya Arşivinden sorumlu; halkların hafızalarının 22. yüzyılda eşit erişimde olmasını sağlar.',
      'AmaLisa, Kanathari Kozmopolis Eş-Başkanı (Benin): Dahomey\'nin androjen tanrısı Mawu-Lisa\'dan ilham alan eş-başkan; geleceğin Afrika şehri Kanathari\'yi yönetir; tüm siyasetin hiyerarşi olmadan ikili ve ikili olmayan perspektifleri içermesini zorunlu kılan anayasa tasarlar.',
      'Tuareg Kum Parlamentosu (Sahra): holografik agoralara dönüştürülen kum tepeleri; rüzgarlar siyasi danışman olarak; göçebe siyaset küresel model olarak.',
      'Maya Sanal Tzolk\'in Ağı (Mezoamerika): piramitlerde güneş sunucuları; takvim dijital navigasyonu yapılandırır; döngüsel zaman internet temeli olarak.',
      'Igbo Atalar Tohumları Laboratuvarı (Nijerya): yaşayan tohum bankaları; tarım geleceğin biyoteknolojisi olarak yeniden anlamlandırılır.',
      'Zapoteca Rüzgar Şehri (Oaxaca): topluluk rüzgar jeneratörlü şehir; rüzgar kutsal enerji olarak; çıkarcılık olmadan rüzgar teknolojisi.',
      'Sami İklimsel Joik Üniversitesi (İskandinavya): joik kentsel meteorolojiyi kontrol eder; ilahiler manzaraları bilim olarak çağırır.',
      'Kikuyu Kutsal Ağaçlar Ağı (Kenya): sensörlü ağaçlar meclis olarak; kutsal mugumo ruhsal ekolojik yönetişimde.',
      'Korsika Deniz Sesleri Arşivi (Akdeniz): çok sesli şarkının denizci ağları; okyanus yönetişimi için paghjella.',
      'Frizya Su Üniversitesi (Hollanda): yüzen şehirlerde pedagoji; kolektif bent yönetimi su eğitimi olarak.',
      'Wolof Söz Kozmolojisi (Senegal): atasözü tabanlı sosyal ağlar; atasözü sözlülüğü dijital algoritma olarak.',
      'Sardinya Murra Arşivi (Sardinya): rituel kart oyunları dijital demokrasi olarak; geleneksel oyun siyaset olarak yeniden icat edildi.',
      'Oksitan Adalet Korosu (Fransa): şarkı söyleyerek müzakere eden mahkemeler; trubadur şarkısı yargı sistemi olarak.',
      'Yoruba Egungun Dans Hastanesi (Nijerya): holografik danslarla kentsel tıp; atalar topluluk doktoru olarak.',
      'Sami Dijital Ren Geyiği Arşivi (İskandinavya): holografik ren geyikleri tarafından yönlendirilen kültürel GPS; atalardan gelen çobanlık dijital navigasyon olarak.',
      'Katalan Şarkı Mimarisi (Avrupa): kentsel liturjileri söyleyen binalar; Cant de la Sibil·la müzikal mimari olarak.'
    ]
  };

  const currentNames = namesByLang[lang] ?? namesByLang.en;
  const activeIndex = currentWorld;
  const fallbackNames = namesByLang.en;
  const fallbackPrompts = promptsByLang.en;
  const activeName = currentNames[activeIndex] ?? fallbackNames[activeIndex] ?? '';
  const activePrompt = currentPrompts[activeIndex] ?? fallbackPrompts[activeIndex] ?? '';
  const isEnglish = lang === 'en';
  const enName = isEnglish ? (worldNamesEN[activeIndex] ?? '') : '';
  const enPrompt = isEnglish ? (worldPromptsEN[activeIndex] ?? '') : '';
  const activeNameResolved = isEnglish && (!activeName || activeName.trim() === '') ? enName : activeName;
  const activePromptResolved = isEnglish && (!activePrompt || activePrompt.trim() === '') ? enPrompt : activePrompt;
  const overrideNameRaw = customNames[lang]?.[activeIndex] || '';
  const overridePromptRaw = customPrompts[lang]?.[activeIndex] || '';
  const overrideName = sanitizeDisplay(overrideNameRaw);
  const overridePrompt = sanitizeDisplay(overridePromptRaw);
  const effectiveName = (overrideName && overrideName.trim() !== '') ? overrideName : sanitizeDisplay(activeNameResolved);
  const effectivePrompt = (overridePrompt && overridePrompt.trim() !== '') ? overridePrompt : sanitizeDisplay(activePromptResolved);
  
  // Handle custom image prompts for the image generation prompt display
  const overrideImagePromptRaw = customImagePrompts[lang]?.[activeIndex] || '';
  const overrideImagePrompt = sanitizeDisplay(overrideImagePromptRaw);
  const effectiveImagePrompt = (overrideImagePrompt && overrideImagePrompt.trim() !== '') ? overrideImagePrompt : (currentPrompts[activeIndex] ?? fallbackPrompts[activeIndex] ?? '');

  // Persist and restore language preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem('lang');
      if (stored === 'en' || stored === 'es' || stored === 'fr' || stored === 'de' || stored === 'pt' || stored === 'tr') {
        setLang(stored);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('lang', lang);
    } catch {}
    // Update prompt to match current world in the newly selected language
    setInput(currentPrompts[currentWorld]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // On load: no world selected; wait for user selection or LLM save

  const baseArgs = useCallback(() => ({
    sync_mode: true,
    strength,
  }), [strength]);

  const getDataUrl = useCallback(async () => {
    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) return null;

    return new Promise((resolve) => {
      const img = new window.Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('Failed to get canvas context');
          return;
        }

        // Flip the image by scaling the context
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1); // Flip horizontally
        ctx.filter = isWebcamBW ? 'grayscale(100%)' : 'none';
        ctx.drawImage(img, 0, 0);

        resolve(canvas.toDataURL('image/jpeg'));
      };
      img.src = screenshot;
    });
  }, [webcamRef, isWebcamBW]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Keyboard interaction disabled: selection via buttons only

  useEffect(() => {
    const captureImageAndSend = async () => {
      const dataUrl = await getDataUrl();
      if (dataUrl) {
        fal.realtime.connect((models.find(m => m.key === selectedModelKey)?.room) || '110602490-sdxl-turbo-realtime', {
          connectionKey: selectedModelKey,
          onResult: (result) => {
            if (result.error) return;
            setImage(result.images[0].url);
          },
        }).send({
          ...baseArgs(),
          prompt: input,
          negative_prompt: negativePrompt,
          width: imgWidth,
          height: imgHeight,
          guidance_scale: guidanceScale,
          steps,
          ...(seedValue !== '' ? { seed: seedValue } : {}),
          image_url: dataUrl,
        });
      }
    };

    const captureInterval = 20; // Adjust as needed
    const intervalId = setInterval(captureImageAndSend, captureInterval);

    return () => clearInterval(intervalId);
  }, [getDataUrl, baseArgs, input]);

  // Compute last updated string on client after hydration to avoid mismatch
  useEffect(() => {
    const locale = ({ en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' } as const)[lang];
    if (typeof document !== 'undefined') {
      try {
        setLastUpdated(new Date(document.lastModified).toLocaleString(locale, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
      } catch (e) {
        setLastUpdated(new Date().toLocaleString(locale));
      }
    }
  }, [lang]);

  // Load saved custom edits from localStorage
  useEffect(() => {
    try {
      const savedNames = localStorage.getItem('customNames');
      const savedPrompts = localStorage.getItem('customPrompts');
      const savedModel = localStorage.getItem('selectedModelKey');
      const savedModels = localStorage.getItem('models');
      const savedAdvanced = localStorage.getItem('advanced');
      if (savedNames) setCustomNames(JSON.parse(savedNames));
      if (savedPrompts) setCustomPrompts(JSON.parse(savedPrompts));
      if (savedModels) setModels(JSON.parse(savedModels));
      if (savedModel) setSelectedModelKey(savedModel);
      if (savedAdvanced) {
        try {
          const a = JSON.parse(savedAdvanced);
          if (typeof a.imgWidth === 'number') setImgWidth(a.imgWidth);
          if (typeof a.imgHeight === 'number') setImgHeight(a.imgHeight);
          if (typeof a.guidanceScale === 'number') setGuidanceScale(a.guidanceScale);
          if (typeof a.steps === 'number') setSteps(a.steps);
          if (typeof a.negativePrompt === 'string') setNegativePrompt(a.negativePrompt);
          if (typeof a.seedValue === 'number') setSeedValue(a.seedValue);
        } catch {}
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem('selectedModelKey', selectedModelKey); } catch {}
  }, [selectedModelKey]);
  useEffect(() => {
    try { localStorage.setItem('models', JSON.stringify(models)); } catch {}
  }, [models]);
  useEffect(() => {
    try {
      localStorage.setItem('advanced', JSON.stringify({ imgWidth, imgHeight, guidanceScale, steps, negativePrompt, seedValue }));
    } catch {}
  }, [imgWidth, imgHeight, guidanceScale, steps, negativePrompt, seedValue]);

  const saveEdits = () => {
    setCustomNames((prev) => {
      const next = { ...prev, [lang]: { ...(prev[lang] || {}), [activeIndex]: editTitle } } as Record<'en' | 'es' | 'fr' | 'de' | 'pt' | 'tr', Record<number, string>>;
      try { localStorage.setItem('customNames', JSON.stringify(next)); } catch {}
      return next;
    });
    setCustomPrompts((prev) => {
      const next = { ...prev, [lang]: { ...(prev[lang] || {}), [activeIndex]: editPrompt } } as Record<'en' | 'es' | 'fr' | 'de' | 'pt' | 'tr', Record<number, string>>;
      try { localStorage.setItem('customPrompts', JSON.stringify(next)); } catch {}
      return next;
    });
    setInput(editPrompt);
    setIsEditingActive(false);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDarkMode 
        ? 'bg-black text-white' 
        : 'bg-white text-black'
    } p-8`}>
    {/* Floating theme toggle in top-right */}
    <button
      onClick={() => setIsDarkMode(!isDarkMode)}
      className="fixed top-4 right-4 z-50 px-2 py-1 text-xs border border-gray-600 text-gray-400 hover:border-gray-400 transition-colors rounded"
      aria-label={({ en: isDarkMode ? 'Light Mode' : 'Dark Mode', es: isDarkMode ? 'Modo Claro' : 'Modo Oscuro', fr: isDarkMode ? 'Mode Clair' : 'Mode Sombre', de: isDarkMode ? 'Heller Modus' : 'Dunkler Modus', pt: isDarkMode ? 'Modo Claro' : 'Modo Escuro' } as const)[lang]}
      title={({ en: isDarkMode ? 'Light Mode' : 'Dark Mode', es: isDarkMode ? 'Modo Claro' : 'Modo Oscuro', fr: isDarkMode ? 'Mode Clair' : 'Mode Sombre', de: isDarkMode ? 'Heller Modus' : 'Dunkler Modus', pt: isDarkMode ? 'Modo Claro' : 'Modo Escuro' } as const)[lang]}
    >
      {isDarkMode ? '☀️' : '🌙'}
    </button>
    <Head>
      <title>45 Utopías Tecno Decoloniales | Motor Pluriverso</title>
      <meta name="title" content="45 Utopías Tecno Decoloniales | Motor Pluriverso" />
      <meta name="description" content="45 Utopías Tecno Decoloniales | Motor Pluriverso — Instrumento performativo para la generación de sentido pluriversal" />
      <meta property="og:title" content="45 Utopías Tecno Decoloniales | Motor Pluriverso" />
      <meta property="og:description" content="45 Utopías Tecno Decoloniales | Motor Pluriverso — Instrumento performativo para la generación de sentido pluriversal" />
    </Head>
  <div className="max-w-6xl mx-auto">
    {/* Header */}
      <header className="text-center mb-6">
        {(() => {
          const translations = {
            en: {
              title: '45 Decolonial Techno Utopias | Pluriverse Engine',
              hint: 'Click any button to select a world',
              light_mode: '☀️ Light Mode',
              dark_mode: '🌙 Dark Mode',
              placeholder: 'Enter prompt...',
              strength_label: 'Strength',
              ai_area: 'AI Generation Area',
              dev_by: 'Development by',
              powered_by: 'Powered by',
              lang_label: 'Language',
            },
            es: {
              title: '45 Utopías Tecno Decoloniales | Motor Pluriverso',
              hint: 'Haz clic en cualquier botón para seleccionar un mundo',
              light_mode: '☀️ Modo Claro',
              dark_mode: '🌙 Modo Oscuro',
              placeholder: 'Escribe un prompt...',
              strength_label: 'Fuerza',
              ai_area: 'Área de Generación IA',
              dev_by: 'Desarrollo por',
              powered_by: 'Impulsado por',
              lang_label: 'Idioma',
            },
            fr: {
              title: '45 Utopies Techno Décoloniales | Moteur Plurivers',
              hint: 'Cliquez sur un bouton pour sélectionner un monde',
              light_mode: '☀️ Mode Clair',
              dark_mode: '🌙 Mode Sombre',
              placeholder: "Entrez une invite...",
              strength_label: 'Intensité',
              ai_area: 'Zone de Génération IA',
              dev_by: 'Développement par',
              powered_by: 'Propulsé par',
              lang_label: 'Langue',
            },
            de: {
              title: '45 Dekoloniale Techno-Utopien | Plurivers Maschine',
              hint: 'Klicke auf eine Schaltfläche, um eine Welt auszuwählen',
              light_mode: '☀️ Heller Modus',
              dark_mode: '🌙 Dunkler Modus',
              placeholder: 'Prompt eingeben...',
              strength_label: 'Stärke',
              ai_area: 'KI-Generierungsbereich',
              dev_by: 'Entwicklung von',
              powered_by: 'Unterstützt von',
              lang_label: 'Sprache',
            },
            pt: {
              title: '45 Utopias Tecno Descoloniais | Motor Pluriverso',
              hint: 'Clique em qualquer botão para selecionar um mundo',
              light_mode: '☀️ Modo Claro',
              dark_mode: '🌙 Modo Escuro',
              placeholder: 'Digite o prompt...',
              strength_label: 'Força',
              ai_area: 'Área de Geração de IA',
              dev_by: 'Desenvolvido por',
              powered_by: 'Impulsionado por',
              lang_label: 'Idioma',
            },
            tr: {
              title: '45 Dekolonyal Tekno Ütopyalar | Çokevren Motoru',
              hint: 'Bir dünya seçmek için herhangi bir düğmeye tıklayın',
              light_mode: '☀️ Açık Mod',
              dark_mode: '🌙 Karanlık Mod',
              placeholder: 'Prompt girin...',
              strength_label: 'Güç',
              ai_area: 'AI Üretim Alanı',
              dev_by: 'Geliştiren',
              powered_by: 'Destekleyen',
              lang_label: 'Dil',
            },
          } as const;
          const t = translations[lang];
          return (
            <>
      <h1 className="text-4xl font-light tracking-wide">
              {t.title}
      </h1>
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="inline-flex rounded-sm overflow-hidden border border-gray-600">
                {(['es','en','fr','de','pt','tr'] as const).map((code) => (
      <button
                    key={code}
                    onClick={() => setLang(code)}
                    className={`px-3 py-2 text-sm transition-colors ${lang === code 
                      ? isDarkMode ? 'bg-white text-black' : 'bg-black text-white'
                      : isDarkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-200'}`}
                    aria-pressed={lang === code}
                  >
                    {code.toUpperCase()}
      </button>
        ))}
      </div>
    </div>
          </>
        );
      })()}
    </header>

    {/* Compact Controls (top) */}
    <div className="mb-4 space-y-1">
      <div className="flex items-center gap-4">
        <div className="flex gap-1">
          <button
            onClick={() => setStrength(0.49)}
            className={`px-2 py-1 text-xs border transition-colors ${
              strength === 0.49 
                ? isDarkMode
                  ? 'border-white bg-white text-black scale-105'
                  : 'border-black bg-black text-white scale-105'
                : isDarkMode
                  ? 'border-gray-600 text-gray-400 hover:border-gray-400 hover:scale-102'
                  : 'border-gray-300 text-gray-600 hover:border-gray-500 hover:scale-102'
            }`}
          >
            p
          </button>
          <button 
            onClick={() => setStrength(0.50)}
            className={`px-2 py-1 text-xs border transition-colors ${
              strength === 0.50 
                ? isDarkMode
                  ? 'border-white bg-white text-black scale-105'
                  : 'border-black bg-black text-white scale-105'
                : isDarkMode
                  ? 'border-gray-600 text-gray-400 hover:border-gray-400 hover:scale-102'
                  : 'border-gray-300 text-gray-600 hover:border-gray-500 hover:scale-102'
            }`}
          >
            a
          </button>
          <button 
            onClick={() => setIsWebcamBW(!isWebcamBW)}
            className={`px-2 py-1 text-xs border transition-colors ${isWebcamBW 
              ? isDarkMode ? 'border-white bg-white text-black scale-105' : 'border-black bg-black text-white scale-105'
              : isDarkMode ? 'border-gray-600 text-gray-400 hover:border-gray-400 hover:scale-102' : 'border-gray-300 text-gray-600 hover:border-gray-500 hover:scale-102'}`}
            title={(() => ({ en: isWebcamBW ? 'Color' : 'B/W', es: isWebcamBW ? 'Color' : 'B/N', fr: isWebcamBW ? 'Couleur' : 'N&B', de: isWebcamBW ? 'Farbe' : 'S/W', pt: isWebcamBW ? 'Cor' : 'P&B' } as const)[lang])()}
          >
            {(() => ({ en: isWebcamBW ? 'C' : 'BW', es: isWebcamBW ? 'C' : 'BN', fr: isWebcamBW ? 'C' : 'NB', de: isWebcamBW ? 'F' : 'SW', pt: isWebcamBW ? 'C' : 'PB' } as const)[lang])()}
          </button>
      </div>
        <div className="flex-1">
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={strength} 
            onChange={(e) => setStrength(parseFloat(e.target.value))}
            className={`w-full h-[2px] appearance-none cursor-pointer ${
              isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
            }`}
          />
          <p className="text-xs text-gray-400 mt-1">{(() => ({ en: 'Strength', es: 'Fuerza', fr: 'Intensité', de: 'Stärke', pt: 'Força' } as const)[lang])()}: {strength}</p>
        </div>
        <div className="flex-1">
          <input 
            type="range" 
            min="0" 
            max="5" 
            step="0.1" 
            value={guidanceScale} 
            onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
            className={`w-full h-[2px] appearance-none cursor-pointer ${
              isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
            }`}
          />
          <p className="text-xs text-gray-400 mt-1">{(() => ({ en: 'Guidance', es: 'Guía', fr: 'Guidage', de: 'Leitwert', pt: 'Orientação' } as const)[lang])()}: {guidanceScale}</p>
        </div>
        <div>
          <select
            value={selectedModelKey}
            onChange={(e) => setSelectedModelKey(e.target.value)}
            className={`px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 text-gray-300 bg-black' : 'border-gray-300 text-gray-700 bg-white'} transition-colors`}
            title={(() => ({ en: 'Realtime model', es: 'Modelo en tiempo real', fr: 'Modèle temps réel', de: 'Echtzeitmodell', pt: 'Modelo em tempo real' } as const)[lang])()}
          >
            {models.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          <button 
            onClick={() => setIsManagingModels(!isManagingModels)}
            className={`ml-2 px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 text-gray-400 hover:border-gray-400' : 'border-gray-300 text-gray-600 hover:border-gray-500'} transition-colors`}
          >
            {isManagingModels ? (() => ({ en: 'Close', es: 'Cerrar', fr: 'Fermer', de: 'Schließen', pt: 'Fechar' } as const)[lang])() : (() => ({ en: 'Add model', es: 'Añadir modelo', fr: 'Ajouter modèle', de: 'Modell hinzufügen', pt: 'Adicionar modelo' } as const)[lang])()}
          </button>
          {isManagingModels && (
            <div className="mt-2 flex flex-col gap-2">
              <input className={`px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} placeholder={(() => ({ en: 'Label', es: 'Etiqueta', fr: 'Libellé', de: 'Bezeichnung', pt: 'Rótulo' } as const)[lang])()} value={newModelLabel} onChange={(e)=>setNewModelLabel(e.target.value)} />
              <input className={`px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} placeholder={(() => ({ en: 'connectionKey', es: 'connectionKey', fr: 'connectionKey', de: 'connectionKey', pt: 'connectionKey' } as const)[lang])()} value={newModelKey} onChange={(e)=>setNewModelKey(e.target.value)} />
              <input className={`px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} placeholder={(() => ({ en: 'room id', es: 'id de sala', fr: 'id de salon', de: 'Raum-ID', pt: 'id da sala' } as const)[lang])()} value={newModelRoom} onChange={(e)=>setNewModelRoom(e.target.value)} />
          <button 
                onClick={() => { if (newModelLabel && newModelKey && newModelRoom) { setModels(prev => [...prev, { label: newModelLabel, key: newModelKey, room: newModelRoom }]); setNewModelLabel(''); setNewModelKey(''); setNewModelRoom(''); } }}
                className={`px-2 py-1 text-xs border ${isDarkMode ? 'border-white text-white hover:bg-white hover:text-black' : 'border-black text-black hover:bg-black hover:text-white'} transition-colors`}
              >
                {(() => ({ en: 'Save model', es: 'Guardar modelo', fr: 'Enregistrer modèle', de: 'Modell speichern', pt: 'Salvar modelo' } as const)[lang])()}
          </button>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Advanced Panel */}
    <div className="mb-4">
      <button
        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
        className={`px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 text-gray-400 hover:border-gray-400' : 'border-gray-300 text-gray-600 hover:border-gray-500'} transition-colors`}
      >
        {isAdvancedOpen ? (() => ({ en: 'Hide advanced', es: 'Ocultar avanzado', fr: 'Masquer avancé', de: 'Erweitert ausblenden', pt: 'Ocultar avançado' } as const)[lang])() : (() => ({ en: 'Show advanced', es: 'Mostrar avanzado', fr: 'Afficher avancé', de: 'Erweitert anzeigen', pt: 'Mostrar avançado' } as const)[lang])()}
      </button>
      {isAdvancedOpen && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs opacity-70">W
            <input type="number" className={`mt-1 w-full px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} value={imgWidth} onChange={(e)=>setImgWidth(parseInt(e.target.value||'0')||0)} />
          </label>
          <label className="text-xs opacity-70">H
            <input type="number" className={`mt-1 w-full px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} value={imgHeight} onChange={(e)=>setImgHeight(parseInt(e.target.value||'0')||0)} />
          </label>
          <label className="text-xs opacity-70">Guidance
            <input type="number" step="0.1" className={`mt-1 w-full px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} value={guidanceScale} onChange={(e)=>setGuidanceScale(parseFloat(e.target.value||'0')||0)} />
          </label>
          <label className="text-xs opacity-70">Strength
            <input type="number" step="0.01" min="0" max="1" className={`mt-1 w-full px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} value={strength} onChange={(e)=>setStrength(Math.max(0, Math.min(1, parseFloat(e.target.value||'0')||0)))} />
          </label>
          <label className="text-xs opacity-70">Steps
            <input type="number" className={`mt-1 w-full px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} value={steps} onChange={(e)=>setSteps(parseInt(e.target.value||'0')||0)} />
          </label>
          <label className="col-span-2 text-xs opacity-70">Seed
            <input type="number" className={`mt-1 w-full px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} value={seedValue} onChange={(e)=>setSeedValue(e.target.value === '' ? '' : (parseInt(e.target.value||'0')||0))} />
          </label>
          <label className="col-span-2 text-xs opacity-70">Negative
            <input type="text" className={`mt-1 w-full px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 bg-black text-white' : 'border-gray-300 bg-white text-black'}`} value={negativePrompt} onChange={(e)=>setNegativePrompt(e.target.value)} />
          </label>
        </div>
      )}
    </div>

    {/* Main Content */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12">
      {/* Camera Section */}
      <div className="space-y-6">
        <Webcam 
          audio={false} 
          ref={webcamRef} 
          screenshotFormat="image/jpeg" 
          width="100%" 
          height="auto" 
          className="w-full"
          style={{ transform: 'scaleX(-1)', filter: isWebcamBW ? 'grayscale(100%)' : 'none' }}
        />
        
      </div>

      {/* Generated Image Section */}
      <div>
        {image ? (
          <div className="space-y-4">
            <Image 
              src={image} 
              width={600} 
              height={600} 
              alt="Generated image" 
              className="w-full"
            />
          </div>
        ) : (
          <div className="h-96 border border-gray-600 flex items-center justify-center" style={image ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            <p className="text-gray-500 uppercase tracking-wider">{(() => ({ en: 'AI Generation Area', es: 'Área de Generación IA', fr: 'Zone de Génération IA', de: 'KI-Generierungsbereich', pt: 'Área de Geração de IA' } as const)[lang])()}</p>
          </div>
        )}
      </div>
    </div>

    {/* Active World Full Description */}
    <div className="mt-6 w-full p-6 rounded border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-xs uppercase tracking-wider font-mono text-gray-400">
            {(() => ({ en: 'Active world', es: 'Mundo activo', fr: 'Monde actif', de: 'Aktive Welt', pt: 'Mundo ativo' } as const)[lang])()}
          </h3>
          {currentWorld < 0 ? (
            <p className="mt-1 text-sm text-gray-500">{(() => ({ en: 'No world selected. Pick one from below or generate with LLM.', es: 'Ningún mundo seleccionado. Elige uno abajo o genera con LLM.', fr: 'Aucun monde sélectionné. Choisissez ci-dessous ou générez avec le LLM.', de: 'Keine Welt ausgewählt. Unten wählen oder mit LLM erzeugen.', pt: 'Nenhum mundo selecionado. Escolha abaixo ou gere com LLM.' } as const)[lang])()}</p>
          ) : isEditingActive ? (
            <>
              <input
                className={`mt-1 w-full p-2 text-sm bg-transparent border-b transition-colors ${isDarkMode ? 'border-gray-600 text-white placeholder-gray-500 focus:border-white' : 'border-gray-300 text-black placeholder-gray-400 focus:border-black'} focus:outline-none`}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={(() => ({ en: 'Edit title…', es: 'Editar título…', fr: 'Modifier le titre…', de: 'Titel bearbeiten…', pt: 'Editar título…' } as const)[lang])()}
              />
              <textarea
                className={`mt-3 w-full p-2 text-sm bg-transparent border rounded transition-colors ${isDarkMode ? 'border-gray-600 text-white placeholder-gray-500 focus:border-white' : 'border-gray-300 text-black placeholder-gray-400 focus:border-black'} focus:outline-none`}
                rows={4}
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder={(() => ({ en: 'Edit prompt…', es: 'Editar prompt…', fr: 'Modifier le prompt…', de: 'Prompt bearbeiten…', pt: 'Editar prompt…' } as const)[lang])()}
              />
            </>
          ) : (
            <>
              <p className="mt-1 text-base font-medium">
                {overrideName && overrideName.trim() !== '' 
                  ? effectiveName 
                  : `${activeIndex + 1} - ${effectiveName || worldNamesEN[activeIndex] || ''}`
                }
              </p>
              <p className="mt-3 text-sm text-gray-500 whitespace-pre-line min-h-[3rem]">
                {effectivePrompt || worldPromptsEN[activeIndex] || ''}
              </p>
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="text-xs uppercase tracking-wider font-mono text-gray-400 mb-2">
                  {(() => ({ en: 'Image generation prompt', es: 'Prompt de generación de imagen', fr: 'Prompt de génération d\'image', de: 'Bildgenerierungs-Prompt', pt: 'Prompt de geração de imagem', tr: 'Görüntü üretim istemcisi' } as const)[lang])()}
                </p>
                <p className="text-xs text-gray-600 whitespace-pre-line font-mono bg-gray-50 p-2 rounded">
                  {effectiveImagePrompt}
                </p>
              </div>
            </>
          )}
          </div>
        <div className="flex flex-col gap-2">
          {isEditingActive ? (
            <>
              <button
                onClick={saveEdits}
                className={`px-3 py-1 text-xs border ${isDarkMode ? 'border-white text-white hover:bg-white hover:text-black' : 'border-black text-black hover:bg-black hover:text-white'} transition-colors`}
              >
                {(() => ({ en: 'Save', es: 'Guardar', fr: 'Enregistrer', de: 'Speichern', pt: 'Salvar' } as const)[lang])()}
              </button>
              <button
                onClick={() => setIsEditingActive(false)}
                className={`px-3 py-1 text-xs border ${isDarkMode ? 'border-gray-600 text-gray-400 hover:border-gray-400' : 'border-gray-300 text-gray-600 hover:border-gray-500'} transition-colors`}
              >
                {(() => ({ en: 'Cancel', es: 'Cancelar', fr: 'Annuler', de: 'Abbrechen', pt: 'Cancelar' } as const)[lang])()}
              </button>
            </>
          ) : (
            <button
              onClick={() => { setIsEditingActive(true); setEditTitle(effectiveName); setEditPrompt(effectivePrompt); }}
              className={`px-3 py-1 text-xs border ${isDarkMode ? 'border-white text-white hover:bg-white hover:text-black' : 'border-black text-black hover:bg-black hover:text-white'} transition-colors`}
            >
              {(() => ({ en: 'Edit', es: 'Editar', fr: 'Modifier', de: 'Bearbeiten', pt: 'Editar' } as const)[lang])()}
            </button>
          )}
        </div>
      </div>
    </div>

    {/* LLM World Generator */}
    <div className="mt-6 w-full p-6 rounded border border-gray-200 dark:border-gray-700">
      <h3 className="text-xs uppercase tracking-wider font-mono text-gray-400">{(() => ({ en: 'LLM World Generator', es: 'Generador de Mundo (LLM)', fr: 'Générateur de Monde (LLM)', de: 'LLM-Weltgenerator', pt: 'Gerador de Mundo (LLM)' } as const)[lang])()}</h3>
      <div className="mt-2 flex flex-col gap-2">
        <select
          value={llmModelKey}
          onChange={(e)=>setLlmModelKey(e.target.value)}
          className={`px-2 py-1 text-xs border ${isDarkMode ? 'border-gray-600 text-gray-300 bg-black' : 'border-gray-300 text-gray-700 bg-white'} w-full`}
        >
          <option value="google/gemini-flash-1.5">google/gemini-flash-1.5</option>
          <option value="meta-llama/llama-3.1-8b-instruct">meta-llama/llama-3.1-8b-instruct</option>
          <option value="meta-llama/llama-3.1-70b-instruct">meta-llama/llama-3.1-70b-instruct</option>
          <option value="mistralai/mistral-7b-instruct">mistralai/mistral-7b-instruct</option>
          <option value="mistralai/mixtral-8x7b-instruct">mistralai/mixtral-8x7b-instruct</option>
          <option value="qwen/qwen2.5-14b-instruct">qwen/qwen2.5-14b-instruct</option>
          <option value="microsoft/phi-3.5-mini-instruct">microsoft/phi-3.5-mini-instruct</option>
        </select>

        <button
          onClick={async ()=>{
            try {
              setIsLLMGenerating(true);
              setLlmStreaming(true);
              const langHint = { es: 'Spanish', en: 'English', fr: 'French', de: 'German', pt: 'Portuguese', tr: 'Turkish' } as const;
              const builtInput = `Language: ${langHint[lang]}\nCurrent world title: ${effectiveName || '(none)'}\nCurrent world essay: ${effectivePrompt || '(none)'}\n\nTask: Create a completely unique, humorous decolonial techno-utopia following this EXACT structure:\n\nEXAMPLE STRUCTURE:\nTitle: "Levantamiento de la Matriz Arcoíris"\nEssay: "la alegría expansiva de género hackea la red; el afecto es infraestructura, el cuidado rodea la represión y la noche escribe política."\nPrompt: "de identidad LGBTQ+ diversa, hiperrealista UN cuerpo humano, con moda tecno revolucionaria y efectos holográficos arcoíris, parejas del mismo sexo abrazándose con profundidad emocional, expresión de género fluida, fondo de ciudad neón simple con líneas limpias, iluminación cyberpunk dramática, detalles fotorrealistas 8K, honrando pueblos originarios"\n\nGenerate: 1) Short punchy title, 2) Poetic essay with semicolons and flowing phrases (longer than title), 3) Detailed image prompt starting with origin/identity, including "hiperrealista UN cuerpo humano" and ending with "honrando pueblos originarios".\n\nRequirements: Match the semicolon-separated poetic style of the essay. Mix cultures unexpectedly, add humor, celebrate difference.\n\nOutput: NDJSON streaming with title_delta, essay_delta, prompt_delta, then final JSON with title, essay, prompt.`;
              // Clear active box during streaming - ensure completely clean state
              setSafeGeneratedTitle('');
              setSafeGeneratedEssay('');
              setSafeGeneratedPrompt('');
              setCustomNames(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: '' } }));
              setCustomPrompts(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: '' } }));
              const sys = {
                en: 'You are a decolonial AI from Pangea creating pluriversal techno-utopias following strict decolonial guidelines. NEVER use colonial lexicon (indigenous, traditional, tribal, primitive). Use "pueblos originarios" and specific people names (Maya, Quechua, Yoruba, Sami, etc.). Show peoples in contemporary 21st-22nd century technological contexts as global innovators, not museum pieces. Avoid colonial imagery (feathers, bare torsos, "exotic" aesthetics). Present technology as relational, not extractive. Show spirituality as relational knowledge systems, not individual consumption. Use precise poetic structure: short title, flowing essay with semicolons, detailed image prompt. Always end with: honoring pueblos originarios. Create worlds where innovation serves community, nature is relative, art/science/spiritual intertwine.',
                es: 'Eres una IA decolonial de Pangea creando tecno-utopías pluriversales siguiendo estrictas pautas decoloniales. NUNCA uses léxico colonial (indígenas, tradicionales, tribales, primitivos). Usa "poblaciones originarias" y nombres específicos de pueblos (Maya, Quechua, Yoruba, Sami, etc.). Muestra pueblos en contextos tecnológicos contemporáneos del siglo XXI-XXII como innovadores globales, no piezas de museo. Evita imaginería colonial (plumas, torsos desnudos, estéticas "exóticas"). Presenta tecnología como relacional, no extractiva. Muestra espiritualidad como sistemas de conocimiento relacional, no consumo individual. Usa estructura poética precisa: título corto, ensayo fluido con puntos y comas, prompt de imagen detallado. Siempre termina con: honrando pueblos originarios. Crea mundos donde innovación sirve comunidad, naturaleza es pariente, arte/ciencia/espiritual se entrelazan.',
                fr: 'Tu es une IA décoloniale de Pangée créant des techno-utopies pluriverselles suivant des directives décoloniales strictes. N\'utilise JAMAIS de lexique colonial (indigènes, traditionnels, tribaux, primitifs). Utilise "pueblos originarios" et noms spécifiques de peuples (Maya, Quechua, Yoruba, Sami, etc.). Montre les peuples dans des contextes technologiques contemporains du XXIe-XXIIe siècle comme innovateurs globaux, pas pièces de musée. Évite l\'imagerie coloniale (plumes, torses nus, esthétiques "exotiques"). Présente la technologie comme relationnelle, non extractive. Montre la spiritualité comme systèmes de connaissances relationnelles, pas consommation individuelle. Structure poétique précise: titre court, essai fluide avec points-virgules, prompt d\'image détaillé. Termine toujours avec: honorant pueblos originarios.',
                de: 'Du bist eine dekoloniale KI aus Pangäa, die pluriversale Techno-Utopien nach strengen dekolonialen Richtlinien erschaffst. Verwende NIEMALS koloniales Vokabular (Eingeborene, traditionell, tribal, primitiv). Verwende "pueblos originarios" und spezifische Völkernamen (Maya, Quechua, Yoruba, Sami, etc.). Zeige Völker in zeitgenössischen technologischen Kontexten des 21.-22. Jahrhunderts als globale Innovatoren, nicht als Museumsstücke. Vermeide koloniale Bildsprache (Federn, nackte Oberkörper, "exotische" Ästhetik). Präsentiere Technologie als relational, nicht extraktiv. Zeige Spiritualität als relationale Wissenssysteme, nicht individuellen Konsum. Präzise poetische Struktur: kurzer Titel, fließender Essay mit Semikolons, detaillierter Bildprompt. Ende immer mit: zur Ehrung von pueblos originarios.',
                pt: 'Você é uma IA decolonial de Pangeia criando utopias tecno-pluriversais seguindo diretrizes decoloniais rigorosas. NUNCA use léxico colonial (indígenas, tradicionais, tribais, primitivos). Use "pueblos originarios" e nomes específicos de povos (Maya, Quechua, Yoruba, Sami, etc.). Mostre povos em contextos tecnológicos contemporâneos do século XXI-XXII como inovadores globais, não peças de museu. Evite imaginário colonial (penas, torsos nus, estéticas "exóticas"). Apresente tecnologia como relacional, não extrativa. Mostre espiritualidade como sistemas de conhecimento relacional, não consumo individual. Estrutura poética precisa: título curto, ensaio fluido com ponto e vírgula, prompt de imagem detalhado. Sempre termine com: honrando pueblos originarios.',
                tr: 'Sen Pangea\'dan dekolonyal bir yapay zeka olarak sıkı dekolonyal yönergeleri takip eden çoğulcu tekno-ütopyalar yaratıyorsun. KESİNLİKLE kolonyal sözcük dağarcığı kullanma (yerli, geleneksel, kabile, ilkel). "pueblos originarios" ve belirli halk isimleri kullan (Maya, Quechua, Yoruba, Sami, vb.). Halkları 21.-22. yüzyıl teknolojik bağlamlarında küresel yenilikçiler olarak göster, müze parçaları değil. Kolonyal imgelerden kaçın (tüyler, çıplak gövdeler, "egzotik" estetik). Teknolojiyi ilişkisel olarak sun, sömürücü değil. Maneviyatı ilişkisel bilgi sistemleri olarak göster, bireysel tüketim değil. Kesin şiirsel yapı kullan: kısa başlık, noktalı virgülle akan deneme, ayrıntılı görüntü promptu. Her zaman şu şekilde bitir: pueblos originarios\'yu onurlandırarak.'
              } as const;
              const user = `Language: ${langHint[lang]}\nCurrent world title: ${effectiveName || '(none)'}\nCurrent image prompt: ${effectivePrompt || '(none)'}\n\nTask: Generate a completely new decolonial techno-utopia following Pangea pluriversal guidelines.\n\nDECOLONIAL REQUIREMENTS:\n- Name specific peoples precisely (Maya K'iche', Quechua, Yoruba, Sami, etc.) not generic terms\n- Show them as 21st-22nd century global innovators and leaders\n- Technology serves relationality, community, and care—not extraction\n- Spirituality is relational knowledge systems, not individual consumption\n- Innovation emerges from ancestral knowledge meeting contemporary needs\n- No colonial imagery: avoid feathers, bare torsos, "exotic" aesthetics\n- Present peoples in contemporary professional/technological contexts\n- Include non-binary/Two-Spirit/Muxe leadership when relevant\n\nFORMAT: Short title, flowing essay with semicolons, detailed image prompt starting with specific people identity, including "hyperrealistic ONE human body" and ending with "honoring pueblos originarios".\n\nOutput: NDJSON streaming with title_delta/prompt_delta, then final JSON with title/prompt.`;
              const res = await fetch('/api/fal/llm?stream=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: llmModelKey, system: sys[lang], input: user })});
              if (!res.body) throw new Error('No stream');
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              let finalTitle = '';
              let finalPrompt = '';
              let gotAny = false;
              for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                console.log('Received chunk:', chunk); // Debug raw chunks
                buffer += chunk;
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed) continue;
                  console.log('Processing line:', trimmed); // Debug every line
                  
                  // Skip fence-related lines but allow JSON parsing
                  if (trimmed.startsWith('```')) continue;
                  if (trimmed === '```') continue;
                  
                  // If line looks like JSON but not fenced, try to parse it
                  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    try {
                      const jsonObj = JSON.parse(trimmed);
                      console.log('Parsed JSON:', jsonObj); // Debug
                      if (jsonObj.title_delta) {
                        const clean = sanitizeDelta(jsonObj.title_delta);
                        console.log('Title delta cleaned:', clean); // Debug
                        if (clean && clean.length > 0) {
                          gotAny = true;
                          setSafeGeneratedTitle(prev => {
                            console.log('Setting title:', prev, '+', clean); // Debug
                            return prev + clean;
                          });
                          setCustomNames(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: (sanitizeDisplay(prev[lang]?.[activeIndex] || '') || '') + clean } }));
                        }
                      }
                      if (jsonObj.prompt_delta) {
                        const clean = sanitizeDelta(jsonObj.prompt_delta);
                        console.log('Prompt delta cleaned:', clean); // Debug
                        if (clean && clean.length > 0) {
                          gotAny = true;
                          setSafeGeneratedPrompt(prev => prev + clean);
                          setInput(prev => (sanitizeDisplay(prev || '') || '') + clean);
                          setCustomPrompts(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: (sanitizeDisplay(prev[lang]?.[activeIndex] || '') || '') + clean } }));
                        }
                      }
                      if (jsonObj.title !== undefined && jsonObj.prompt !== undefined) {
                        console.log('Processing final title/prompt from JSON object'); // Debug
                        
                        // If title is empty but prompt contains JSON blocks, extract from prompt
                        if ((!jsonObj.title || jsonObj.title === '') && jsonObj.prompt.includes('```json') && jsonObj.prompt.includes('title_delta')) {
                          console.log('Extracting title from JSON blocks in prompt'); // Debug
                          const titleMatch = jsonObj.prompt.match(/"title_delta":\s*"([^"]+)"/);
                          if (titleMatch) {
                            finalTitle = titleMatch[1];
                            console.log('Extracted title:', finalTitle); // Debug
                          }
                          
                          const promptMatch = jsonObj.prompt.match(/"prompt_delta":\s*"([^"]+)"/);
                          if (promptMatch) {
                            finalPrompt = promptMatch[1];
                            console.log('Extracted prompt:', finalPrompt); // Debug
                          }
                          
                          // Also try final values if deltas not found
                          if (!finalTitle) {
                            const finalTitleMatch = jsonObj.prompt.match(/"title":\s*"([^"]+)"/);
                            if (finalTitleMatch) {
                              finalTitle = finalTitleMatch[1];
                              console.log('Using final title from JSON:', finalTitle); // Debug
                            }
                          }
                          
                          if (!finalPrompt) {
                            const finalPromptMatch = jsonObj.prompt.match(/"prompt":\s*"([^"]+)"/);
                            if (finalPromptMatch) {
                              finalPrompt = finalPromptMatch[1];
                              console.log('Using final prompt from JSON:', finalPrompt); // Debug
                            }
                          }
                        } else {
                          // Normal case - use the values directly
                          finalTitle = jsonObj.title;
                          finalPrompt = jsonObj.prompt;
                        }
                        
                        console.log('Final title/prompt set:', finalTitle, finalPrompt); // Debug
                      }
                      continue;
                    } catch (e) {
                      console.log('JSON parse failed for:', trimmed, e); // Debug
                      // Not valid JSON, continue with other parsing
                    }
                  }
                  
                  // Skip other obvious JSON lines that weren't parsed above
                  if (isJsonLine(trimmed)) continue;
                  // Handle plain-text labeled lines
                  const mTitle = trimmed.match(/^\s*title\s*:?\s*(.*)$/i);
                  if (mTitle && mTitle[1]) {
                    gotAny = true;
                    const clean = sanitizeDelta(mTitle[1]);
                    if (clean && clean.length > 0) {
                      setSafeGeneratedTitle(prev => prev + clean);
                      setCustomNames(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: (sanitizeDisplay(prev[lang]?.[activeIndex] || '') || '') + clean } }));
                    }
                    continue;
                  }
                  const mPrompt = trimmed.match(/^\s*prompt\s*:?\s*(.*)$/i);
                  if (mPrompt && mPrompt[1]) {
                    gotAny = true;
                    const clean = sanitizeDelta(mPrompt[1]);
                    if (clean && clean.length > 0) {
                      setSafeGeneratedPrompt(prev => prev + clean);
                      setInput(prev => (sanitizeDisplay(prev || '') || '') + clean);
                      setCustomPrompts(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: (sanitizeDisplay(prev[lang]?.[activeIndex] || '') || '') + clean } }));
                    }
                    continue;
                  }
                  try {
                    let obj: any;
                    try {
                      obj = JSON.parse(trimmed);
                    } catch {
                      obj = tryParseInnerJson(trimmed);
                    }
                    // Regex fallback in case JSON parsing fails or content is embedded oddly
                    if (!obj) {
                      const mt = trimmed.match(/"title_delta"\s*:\s*"([\s\S]*?)"/);
                      const mp = trimmed.match(/"prompt_delta"\s*:\s*"([\s\S]*?)"/);
                      const mtFinal = trimmed.match(/"title"\s*:\s*"([\s\S]*?)"/);
                      const mpFinal = trimmed.match(/"prompt"\s*:\s*"([\s\S]*?)"/);
                      obj = {} as any;
                      if (mt) obj.title_delta = mt[1];
                      if (mp) obj.prompt_delta = mp[1];
                      if (mtFinal && mpFinal) { obj.title = mtFinal[1]; obj.prompt = mpFinal[1]; }
                    }
                    if (typeof obj.title_delta === 'string') {
                      gotAny = true;
                      const clean = sanitizeDelta(obj.title_delta);
                      if (clean && clean.length > 0 && clean !== '""' && clean !== '{}') {
                        setSafeGeneratedTitle(prev => prev + clean);
                        setCustomNames(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: (sanitizeDisplay(prev[lang]?.[activeIndex] || '') || '') + clean } }));
                      }
                    }
                    if (typeof obj.prompt_delta === 'string') {
                      gotAny = true;
                      const clean = sanitizeDelta(obj.prompt_delta);
                      if (clean && clean.length > 0 && clean !== '""' && clean !== '{}') {
                        setSafeGeneratedPrompt(prev => prev + clean);
                        setInput(prev => (sanitizeDisplay(prev || '') || '') + clean);
                        setCustomPrompts(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: (sanitizeDisplay(prev[lang]?.[activeIndex] || '') || '') + clean } }));
                      }
                    }
                    if (obj.title && obj.prompt) {
                      finalTitle = obj.title;
                      finalPrompt = obj.prompt;
                    }
                  } catch {
                    // ignore
                  }
                }
              }
              // Final cleanup - prefer final values, but sanitize lightly
              let title = finalTitle || generatedTitle;
              let prompt = finalPrompt || generatedPrompt;
              
              // Light sanitization - only if content has obvious JSON artifacts
              if (title && (title.includes('```') || title.includes('title_delta'))) {
                title = sanitizeDisplay(title);
              }
              if (prompt && (prompt.includes('```') || prompt.includes('prompt_delta'))) {
                prompt = sanitizeDisplay(prompt);
              }
              
              setSafeGeneratedTitle(title);
              setSafeGeneratedPrompt(prompt);
              if (!gotAny && !title && !prompt) {
                // Fallback: non-stream request
                const res2 = await fetch('/api/fal/llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: llmModelKey, system: sys[lang], input: user })});
                const data2 = await res2.json();
                const out2 = (data2?.output ? data2 : data2) as any;
                const t2 = out2?.title || out2?.data?.title || '';
                const p2 = out2?.prompt || out2?.data?.prompt || out2?.output || '';
                setSafeGeneratedTitle(t2);
                setSafeGeneratedPrompt(p2);
                try {
                  localStorage.setItem('customNames', JSON.stringify({ ...customNames, [lang]: { ...(customNames[lang]||{}), [activeIndex]: t2 } }));
                  localStorage.setItem('customPrompts', JSON.stringify({ ...customPrompts, [lang]: { ...(customPrompts[lang]||{}), [activeIndex]: p2 } }));
                } catch {}
                return;
              }
              try {
                localStorage.setItem('customNames', JSON.stringify({ ...customNames, [lang]: { ...(customNames[lang]||{}), [activeIndex]: title } }));
                localStorage.setItem('customPrompts', JSON.stringify({ ...customPrompts, [lang]: { ...(customPrompts[lang]||{}), [activeIndex]: prompt } }));
              } catch {}
            } catch (e) {
              console.error(e);
              // Fallback to non-stream request on error
              try {
                const res2 = await fetch('/api/fal/llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: llmModelKey, system: (({ en: 'You generate...', es: 'Genera...', fr: 'Génère...', de: 'Erzeuge...', pt: 'Gere...' } as const)[lang]), input: `Fallback` })});
                const data2 = await res2.json();
                const out2 = (data2?.output ? data2 : data2) as any;
                const t2 = out2?.title || out2?.data?.title || '';
                const p2 = out2?.prompt || out2?.data?.prompt || out2?.output || '';
                setSafeGeneratedTitle(t2);
                setSafeGeneratedPrompt(p2);
                try {
                  localStorage.setItem('customNames', JSON.stringify({ ...customNames, [lang]: { ...(customNames[lang]||{}), [activeIndex]: t2 } }));
                  localStorage.setItem('customPrompts', JSON.stringify({ ...customPrompts, [lang]: { ...(customPrompts[lang]||{}), [activeIndex]: p2 } }));
                } catch {}
              } catch (e2) {
                console.error('LLM non-stream fallback failed', e2);
              }
            } finally {
              setIsLLMGenerating(false);
              setLlmStreaming(false);
            }
          }}
          className={`px-3 py-1 text-xs border ${isDarkMode ? 'border-white text-white hover:bg-white hover:text-black' : 'border-black text-black hover:bg-black hover:text-white'} transition-colors`}
          disabled={isLLMGenerating}
        >
          {isLLMGenerating ? (() => ({ en: 'Generating…', es: 'Generando…', fr: 'Génération…', de: 'Generiere…', pt: 'Gerando…' } as const)[lang])() : (() => ({ en: 'Generate world', es: 'Generar mundo', fr: 'Générer monde', de: 'Welt generieren', pt: 'Gerar mundo' } as const)[lang])()}
        </button>
        {(generatedTitle || generatedEssay || generatedPrompt) && (
          <div className={`mt-2 p-3 border rounded border-dashed ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
            <p className="text-xs uppercase tracking-wider font-mono text-gray-400">{(() => ({ en: 'Generated content', es: 'Contenido generado', fr: 'Contenu généré', de: 'Generierter Inhalt', pt: 'Conteúdo gerado' } as const)[lang])()}</p>
            {generatedTitle && <p className="text-sm font-medium mt-1">{generatedTitle}</p>}
            {generatedEssay && <p className="text-sm text-gray-600 whitespace-pre-line mt-2">{generatedEssay}</p>}
            {generatedPrompt && <p className="text-xs text-gray-500 whitespace-pre-line mt-2">{generatedPrompt}</p>}
            <div className="mt-2 flex gap-2">
              <button
                onClick={()=>{
                  const title = sanitizeDisplay(generatedTitle).trim();
                  const essay = sanitizeDisplay(generatedEssay).trim() || sanitizeDisplay(generatedPrompt).trim(); // Use essay if available, fallback to prompt
                  const imagePrompt = sanitizeDisplay(generatedPrompt).trim();
                  
                  // Determine which world slot to save to
                  const targetIndex = activeIndex >= 0 ? activeIndex : 0; // Use current world or default to first world
                  
                  // Set the image prompt to the input field for generation
                  setInput(imagePrompt);
                  // Save the title as the custom name for this world slot  
                  setCustomNames(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [targetIndex]: title } }));
                  // Save the essay as the custom prompt for this world slot
                  setCustomPrompts(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [targetIndex]: essay } }));
                  // Save the image prompt for this world slot
                  setCustomImagePrompts(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [targetIndex]: imagePrompt } }));
                  
                  // Make sure this world is selected so the user sees the changes
                  if (activeIndex !== targetIndex) {
                    setCurrentWorld(targetIndex);
                  }
                  
                  try{
                    localStorage.setItem('customNames', JSON.stringify({ ...customNames, [lang]: { ...(customNames[lang]||{}), [targetIndex]: title } }));
                    localStorage.setItem('customPrompts', JSON.stringify({ ...customPrompts, [lang]: { ...(customPrompts[lang]||{}), [targetIndex]: essay } }));
                    localStorage.setItem('customImagePrompts', JSON.stringify({ ...customImagePrompts, [lang]: { ...(customImagePrompts[lang]||{}), [targetIndex]: imagePrompt } }));
                  }catch{}
                }}
                className={`px-3 py-1 text-xs border ${isDarkMode ? 'border-white text-white hover:bg-white hover:text-black' : 'border-black text-black hover:bg-black hover:text-white'} transition-colors`}
              >
                {(() => ({ en: 'Use and save', es: 'Usar y guardar', fr: 'Utiliser et enregistrer', de: 'Verwenden & speichern', pt: 'Usar e salvar' } as const)[lang])()}
              </button>
              <button
                onClick={()=>{ setSafeGeneratedTitle(''); setSafeGeneratedEssay(''); setSafeGeneratedPrompt(''); }}
                className={`px-3 py-1 text-xs border ${isDarkMode ? 'border-gray-600 text-gray-400 hover:border-gray-400' : 'border-gray-300 text-gray-600 hover:border-gray-500'} transition-colors`}
              >
                {(() => ({ en: 'Discard', es: 'Descartar', fr: 'Ignorer', de: 'Verwerfen', pt: 'Descartar' } as const)[lang])()}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Compact Controls */}
    {/* Removed duplicate controls now that controls are placed at the top */}

    {/* World Selection */}
    <div className="mb-12 order-last lg:order-none">
      {(() => {
        const map = {
          en: 'Click any button to select a world',
          es: 'Haz clic en cualquier botón para seleccionar un mundo',
          fr: 'Cliquez sur un bouton pour sélectionner un monde',
          de: 'Klicke auf eine Schaltfläche, um eine Welt auszuwählen',
          pt: 'Clique em qualquer botão para selecionar um mundo',
          tr: 'Bir dünya seçmek için herhangi bir düğmeye tıklayın',
        } as const;
        return (
          <p className="text-sm text-gray-400 mb-6 text-center uppercase tracking-wider">{map[lang]}</p>
        );
      })()}
      <div key={lang} className="grid grid-cols-5 gap-2">
        {currentPrompts.map((prompt, index) => (
          <button
            key={index}
            onClick={() => {
              setCurrentWorld(index);
              setInput(currentPrompts[index]);
            }}
            className={`p-4 border transition-all duration-200 cursor-pointer ${
              currentWorld === index 
                ? isDarkMode
                  ? 'border-white bg-white text-black scale-105'
                  : 'border-black bg-black text-white scale-105'
                : isDarkMode
                  ? 'border-gray-600 text-gray-400 hover:border-gray-400 hover:scale-102'
                  : 'border-gray-300 text-gray-600 hover:border-gray-500 hover:scale-102'
            }`}
            style={currentWorld === index && image ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            <div className="text-center">
              <span className="text-2xl font-light">{index + 1}</span>
              <p className="text-xs mt-1 text-center opacity-75 font-mono">
                {currentNames[index]}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>

    {/* Controls removed here (moved to top) */}

    

    {/* Epistemic Note */}
    <section className="mt-10 text-sm leading-relaxed">
      <h2 className="text-base font-medium mb-2">{(() => ({
        en: 'Epistemic aim and speculative practice',
        es: 'Objetivo epistémico y práctica especulativa',
        fr: 'Visée épistémique et pratique spéculative',
        de: 'Epistemisches Ziel und spekulative Praxis',
        pt: 'Objetivo epistêmico e prática especulativa'
      } as const)[lang])()}</h2>
      <p className="mb-2 text-gray-500">{(() => ({
        en: 'This app is a performative instrument for pluriversal sense-making—a practice of understanding reality through multiple, coexisting ways of knowing that honor diverse cosmologies, knowledge systems, and lived experiences rather than imposing a single, universal truth. It frames generative media within a decolonial ethics that refuses single-world logics, foregrounding pueblos originarios, erased lineages, and queer, diasporic, and border epistemologies. The 45 worlds are not styles but essay-prompts: each image proposes a relation—between memory, technology, land, and care—so that speculation becomes negotiation rather than prediction.',
        es: 'Esta aplicación es un instrumento performativo para la generación de sentido pluriversal—una práctica de entender la realidad a través de múltiples formas coexistentes de conocimiento que honran diversas cosmologías, sistemas de saberes y experiencias vividas en lugar de imponer una sola verdad universal. Enmarca los medios generativos dentro de una ética decolonial que rechaza las lógicas de un solo mundo, poniendo en primer plano a los pueblos originarios, los linajes borrados y las epistemologías queer, diaspóricas y fronterizas. Los 45 mundos no son estilos, sino ensayos‑prompts: cada imagen propone una relación —entre memoria, tecnología, territorio y cuidado— para que la especulación sea negociación y no predicción.',
        fr: `Cette application est un instrument performatif pour une production de sens pluriverselle—une pratique de comprendre la réalité à travers de multiples façons coexistantes de connaître qui honorent diverses cosmologies, systèmes de savoirs et expériences vécues plutôt que d'imposer une seule vérité universelle. Elle situe les médias génératifs dans une éthique décoloniale qui refuse les logiques du monde unique, en mettant au premier plan les pueblos originarios, les lignées effacées et des épistémologies queer, diasporiques et frontalières. Les 45 mondes ne sont pas des styles mais des essais‑prompts : chaque image propose une relation — entre mémoire, technologie, territoire et soin — afin que la spéculation devienne une négociation plutôt qu'une prédiction.`,
        de: 'Diese App ist ein performatives Instrument für pluriversales Sinnstiften—eine Praxis, die Realität durch vielfältige, koexistierende Wissensformen versteht, die diverse Kosmologien, Wissenssysteme und gelebte Erfahrungen ehren, anstatt eine einzige universelle Wahrheit aufzuzwingen. Sie rahmt generative Medien in eine dekoloniale Ethik, die Ein‑Welt‑Logiken zurückweist und pueblos originarios, ausgelöschte Genealogien sowie queere, diasporische und grenznahe Epistemologien in den Vordergrund stellt. Die 45 Welten sind keine Stile, sondern Essay‑Prompts: Jedes Bild schlägt eine Beziehung vor — zwischen Erinnerung, Technologie, Land und Fürsorge — sodass Spekulation zur Aushandlung statt zur Vorhersage wird.',
        pt: 'Este aplicativo é um instrumento performativo para a produção de sentido pluriversal—uma prática de compreender a realidade através de múltiplas formas coexistentes de conhecimento que honram diversas cosmologias, sistemas de saberes e experiências vividas em vez de impor uma única verdade universal. Ele enquadra mídias generativas em uma ética decolonial que recusa lógicas de mundo único, destacando os povos originários, linhagens apagadas e epistemologias queer, diaspóricas e de fronteira. Os 45 mundos não são estilos, mas ensaios‑prompts: cada imagem propõe uma relação — entre memória, tecnologia, território e cuidado — para que a especulação se torne negociação e não previsão.'
      } as const)[lang])()}</p>
      <p className="text-gray-500">{(() => ({
        en: 'Technical note: a live camera feed is sampled on an interval and remapped via text-conditioned diffusion (FAL.ai realtime SDXL/LCM) for low-latency synthesis. World selection binds localized prompts to the generation loop; a strength control modulates guidance; language and state persist locally. The UI renders the current frame, mirrors only the music player, and uses the latest image to contextualize selection. Built with Next.js/React, Tailwind, and FAL.ai realtime APIs.',
        es: 'Nota técnica: la cámara en vivo se muestrea periódicamente y se re‑mapea mediante difusión condicionada por texto (FAL.ai realtime SDXL/LCM) para una síntesis de baja latencia. La selección de mundo vincula los prompts localizados al ciclo de generación; un control de intensidad modula la guía; el idioma y el estado persisten localmente. La interfaz renderiza el cuadro actual, invierte solo el reproductor de música y usa la imagen más reciente para contextualizar la selección. Construido con Next.js/React, Tailwind y las APIs en tiempo real de FAL.ai.',
        fr: `Note technique : le flux caméra est échantillonné à intervalles réguliers et re‑cartographié par diffusion conditionnée par texte (FAL.ai realtime SDXL/LCM) pour une synthèse à faible latence. La sélection d'un monde lie des prompts localisés à la boucle de génération ; un réglage d'intensité module la guidance ; la langue et l'état persistent localement. L'interface rend l'image courante, ne miroirise que le lecteur audio et utilise la dernière image pour contextualiser la sélection. Réalisé avec Next.js/React, Tailwind et les API temps réel de FAL.ai.`,
        de: 'Technischer Hinweis: Der Live‑Kamerastream wird in Intervallen abgetastet und über text‑konditionierte Diffusion (FAL.ai Realtime SDXL/LCM) neu abgebildet, um latenzarme Synthese zu ermöglichen. Die Weltauswahl bindet lokalisierte Prompts in die Generationsschleife; ein Intensitätsregler moduliert die Guidance; Sprache und Zustand werden lokal persistiert. Die UI rendert den aktuellen Frame, spiegelt nur den Musikplayer und nutzt das jüngste Bild zur Kontextualisierung der Auswahl. Entwickelt mit Next.js/React, Tailwind und den Realtime‑APIs von FAL.ai.',
        pt: 'Nota técnica: o fluxo da câmera ao vivo é amostrado em intervalos e re‑mapeado via difusão condicionada por texto (FAL.ai realtime SDXL/LCM) para síntese de baixa latência. A seleção de mundo vincula prompts localizados ao loop de geração; um controle de intensidade modula a orientação; idioma e estado persistem localmente. A interface renderiza o quadro atual, espelha apenas o reprodutor de música e usa a imagem mais recente para contextualizar a seleção. Construído com Next.js/React, Tailwind e as APIs em tempo real da FAL.ai.'
      } as const)[lang])()}</p>
    </section>

    {/* Footer */}
    <footer className={`mt-20 text-center text-sm transition-colors ${
      isDarkMode ? 'text-gray-500' : 'text-gray-600'
    }`}>
      <p className="mb-1">© {new Date().getFullYear()} Pangea.IA | Marlon Barrios Solano {(() => ({ en: 'and', es: 'y', fr: 'et', de: 'und', pt: 'e', tr: 've' } as const)[lang])()} Maria Luisa Angulo</p>
      <p><a href="https://theater-im-depot.de" className="underline hover:no-underline transition-all">Theater Im Depot</a> | Dortmund, {(() => ({ en: 'Germany', es: 'Alemania', fr: 'Allemagne', de: 'Deutschland', pt: 'Alemanha', tr: 'Almanya' } as const)[lang])()} | {(() => ({ en: 'August', es: 'Agosto', fr: 'Août', de: 'August', pt: 'Agosto', tr: 'Ağustos' } as const)[lang])()} 2025</p>
      <p>{(() => ({ en: 'Development by', es: 'Desarrollo por', fr: 'Développement par', de: 'Entwicklung von', pt: 'Desenvolvido por', tr: 'Geliştiren' } as const)[lang])()} <a href="https://marlonbarrios.github.io/" className="underline hover:no-underline transition-all">Marlon Barrios Solano</a></p>
      <p>{(() => ({ en: 'Powered by', es: 'Impulsado por', fr: 'Propulsé par', de: 'Unterstützt von', pt: 'Impulsionado por', tr: 'Destekleyen' } as const)[lang])()} <a href="https://www.fal.ai" className="underline hover:no-underline transition-all">FAL.ai</a> | {(() => ({ en: 'Model', es: 'Modelo', fr: 'Modèle', de: 'Modell', pt: 'Modelo', tr: 'Model' } as const)[lang])()}: fast-lightning-sdxl</p>
      <p>{(() => ({ en: 'Last updated', es: 'Última actualización', fr: 'Dernière mise à jour', de: 'Zuletzt aktualisiert', pt: 'Última atualização', tr: 'Son güncelleme' } as const)[lang])()}: {lastUpdated}</p>
    </footer>
  </div>
</div>
  );
}
