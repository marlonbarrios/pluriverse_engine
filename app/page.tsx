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
  const [lang, setLang] = useState<'es' | 'en' | 'fr' | 'de' | 'pt'>('es');
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
  const [customNames, setCustomNames] = useState<Record<'en' | 'es' | 'fr' | 'de' | 'pt', Record<number, string>>>({ en: {}, es: {}, fr: {}, de: {}, pt: {} });
  const [customPrompts, setCustomPrompts] = useState<Record<'en' | 'es' | 'fr' | 'de' | 'pt', Record<number, string>>>({ en: {}, es: {}, fr: {}, de: {}, pt: {} });
  const [customImagePrompts, setCustomImagePrompts] = useState<Record<'en' | 'es' | 'fr' | 'de' | 'pt', Record<number, string>>>({ en: {}, es: {}, fr: {}, de: {}, pt: {} });
  const [isEditingActive, setIsEditingActive] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');

  const webcamRef = useRef<Webcam>(null);


  // 10 Decolonial Multiverse and Technofuture Prompts (EN)
  const worldPromptsEN = [
    // 0 - Afro-Futurist Liberation
    'of Black or African diaspora origin, hyperrealistic ONE human body in bauhaus style, in flowing techno-garments with intricate golden geometric patterns, floating orbs of ancestral wisdom with ethereal glow, vibrant neon colors, simple dark background with subtle geometric shapes, dramatic cinematic lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
    // 1 - Indigenous Cyber Resistance
    'of Indigenous or originary peoples origin, hyperrealistic ONE human body, in advanced digital camouflage with traditional patterns merged with circuit boards, glowing tribal markings with bioluminescent effects, holographic spirit animals, clean forest background with minimal elements, cinematic lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
    // 2 - Queer Liberation Matrix
    'of diverse LGBTQ+ identity, hyperrealistic ONE human body, in revolutionary techno-fashion with rainbow holographic effects, same-sex couples embracing with emotional depth, gender-fluid expression, simple neon city background with clean lines, dramatic cyberpunk lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
    // 3 - Muslim Steampunk Revolution
    'of Muslim, Black or Middle Eastern origin, hyperrealistic ONE human body, in brass and copper armor with Islamic geometric patterns on steam-powered machines, hijabs with mechanical enhancements, simple brass background with subtle geometric patterns, warm dramatic lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
    // 4 - Latinx Quantum Dreamscape
    'of Latinx or mestizo origin, hyperrealistic ONE human body, floating in cosmic dimensions with Aztec and Mayan symbols in quantum states, vibrant tropical colors, holographic pyramids, simple cosmic background with minimal stars, ethereal lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    
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
    // 0 - Afro-Futurist Liberation
    'de origen de la diáspora africana o negra, hiperrealista UN cuerpo humano en estilo bauhaus, con prendas tecno fluidas y patrones geométricos dorados, orbes flotantes de sabiduría ancestral con brillo etéreo, colores neón vibrantes, fondo oscuro simple con formas geométricas sutiles, iluminación cinematográfica dramática, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 1 - Indigenous Cyber Resistance
    'de origen indígena u originario, hiperrealista UN cuerpo humano, con camuflaje digital avanzado y patrones tradicionales fusionados con circuitos, marcas tribales bioluminiscentes, animales espíritu holográficos, fondo de bosque limpio y minimalista, iluminación cinematográfica, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 2 - Queer Liberation Matrix
    'de identidad LGBTQ+ diversa, hiperrealista UN cuerpo humano, con moda tecno revolucionaria y efectos holográficos arcoíris, parejas del mismo sexo abrazándose con profundidad emocional, expresión de género fluida, fondo de ciudad neón simple con líneas limpias, iluminación cyberpunk dramática, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 3 - Muslim Steampunk Revolution
    'de origen musulmán, negro o de Medio Oriente, hiperrealista UN cuerpo humano, armadura de latón y cobre con patrones geométricos islámicos en máquinas de vapor, hiyabs con mejoras mecánicas, fondo de latón simple con patrones sutiles, iluminación cálida y dramática, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 4 - Latinx Quantum Dreamscape
    'de origen latinx o mestizo, hiperrealista UN cuerpo humano, flotando en dimensiones cósmicas con símbolos aztecas y mayas en estados cuánticos, colores tropicales vibrantes, pirámides holográficas, fondo cósmico simple con estrellas mínimas, iluminación etérea, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 5 - Asian Techno-Spiritual Awakening
    'de origen del este o sur de Asia, hiperrealista UN cuerpo humano, en poses de meditación con túnicas tradicionales y tecnología LED, mandalas flotantes con patrones intrincados, jardines zen con elementos holográficos, fondo zen simple con líneas limpias, iluminación serena y dramática, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 6 - Pacific Islander Ocean Tech
    'de origen polinesio o melanesio, hiperrealista UN cuerpo humano, con trajes acuáticos ciber inspirados en coral y conchas, paisajes submarinos, efectos bioluminiscentes, fondo azul profundo simple con agua sutil, iluminação azul intensa, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 7 - Middle Eastern Digital Oasis
    'de origen árabe o persa, hiperrealista UN cuerpo humano, con túnicas digitales fluidas, oasis desérticos con palmeras holográficas, arte geométrico islámico, fondo desértico simple con horizonte limpio, hora dorada, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 8 - South Asian Cyber Temple
    'de origen indio o pakistaní, hiperrealista UN cuerpo humano, con atuendo tradicional futurista, flores de loto digitales con detalles intrincados, deidades holográficas, fondo de templo simple con arquitectura limpia, iluminación espiritual dramática, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 9 - Global Mash-Up Revolution
    'representando diversidad global de cualquier continente, hiperrealista UN cuerpo humano, con moda tecno revolucionaria, símbolos culturales del mundo fusionados con elementos futuristas, arcoíris de etnicidades, fondo de mapa del mundo simple con líneas limpias, iluminación revolucionaria dramática, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 10 - Meme Bard Renaissance
    'hiperrealista UN cuerpo humano como juglar renacentista con pergaminos de memes holográficos, laúd-emoji, subtítulos flotantes, fondo de pergamino simple con filigranas limpias, foco teatral, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 11 - Influencer Jungle Safari
    'hiperrealista UN cuerpo humano con equipo explorador neón, halo de aro de luz y drones-c luciérnaga, botella de agua gigante, fondo tropical simple con siluetas limpias, iluminación dramática brillante, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 12 - Bureaucracy Labyrinth Boss Level
    'hiperrealista UN cuerpo humano en laberinto de carpetas y sellos infinitos, armadura de escritorio con runas de notas adhesivas, fondo de oficina simple con líneas de fuga nítidas, luz fría fluorescente, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 13 - Retro VHS Aerobics Utopia
    'hiperrealista UN cuerpo humano en licra de los 80 brillante con cinta pixelada, líneas VHS, degradados cromo, fondo de rejilla simple con amanecer, strobes de estudio, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 14 - Pizza Mecha Delivery Rush
    'hiperrealista UN cuerpo humano piloteando un mecha de reparto con hombreras de pizza, propulsores humeantes, líneas de velocidad, fondo de callejón simple con geometría limpia, luz cálida de farolas, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 15 - Coffee Overlords Bean Temple
    'hiperrealista UN cuerpo humano con túnicas-ritual baristas y sigilos de latte art, relicarios de portafiltros flotantes, cometas de granos, fondo de café minimalista con texturas suaves, brillo ámbar, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 16 - Quantum Cat Herding League
    'hiperrealista UN cuerpo humano con traje elegante y emisores de lana entrelazada, gatos translúcidos faseando, constelaciones de huellas, fondo de cielo estrellado simple con formas claras, luz de contorno lúdica, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 17 - Disco Archivist Datavault
    'hiperrealista UN cuerpo humano en vestimenta brillante de bibliotecarie, códices-disco orbitando, borlas-cable, fondo de archivo simple con simetría audaz, foco saturado, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 18 - Crypto Moon Miner Karaoke
    'hiperrealista UN cuerpo humano con overol espacial y micrófono LED, asteroides-moneda, barras de ecualizador, fondo de superficie lunar simple con horizonte limpio, luz neón fría, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 19 - Cloud Wizard Debug Arena
    'hiperrealista UN cuerpo humano como mago-sisadmin con báculo-terminal brillante, sigilos de código en el aire, bichos flotantes, fondo de servidores en nube simple con íconos mínimos, luz helada, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 20 - Pluriversal Assembly Nexus
    'de origen activista-académico del Sur Global, hiperrealista UN cuerpo humano, con atuendo ceremonial policultural de circuitos tejidos, orbes de traducción orbitando, anfiteatro simple con anillos concéntricos, iluminación cálida e inclusiva, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 21 - Border Thinking Commons
    'de origen mestiza de fronteras, hiperrealista UN cuerpo humano, con capa híbrida textil-silicio, pancartas de poesía glitch, pasarela simple con horizonte limpio, luz dorada de contorno, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 22 - Transmodernity Agora
    'de origen filósofo intercultural, hiperrealista UN cuerpo humano, con armadura modular reflectante grabada con escrituras pluriversales, pedestales de debate flotantes, plaza de mármol simple con columnas mínimas, luz de estudio nítida, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 23 - Socialized Power Mesh
    'de origen organizador comunitario, hiperrealista UN cuerpo humano, con exotraje en red de nodos cooperativos, halos de intercambio, simple neighborhood background with clean grid, soft dawn lighting, 8K resolution, photorealistic details, honoring pueblos originarios',
    // 24 - Heterarchy Signal Garden
    'de origen cuidador multiespecie, hiperrealista UN cuerpo humano, con sobrecrecimiento de biocircuitos, flores-antena y enredaderas de datos, jardín en terrazas simple con senderos claros, luz difusa verde, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 25 - Critical Cosmopolitan Forge
    'de origen artesano diaspórico, hiperrealistisch EIN menschlicher Körper, con bata-forja de laboratorio y ríos de código fundido, martillando tratados brillantes, taller simple de geometría limpia, brillo de brasas, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 26 - Epistemic South Observatory
    'de origen afro-indígena investigador, hiperrealistisch EIN menschlicher Körper, con manto estelar y brazaletes sensor, constelaciones renombradas con nombres locales, cielo nocturno simple con horizonte mínimo, luz lunar fría, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 27 - Coloniality Debug Lab
    'de origen analista decolonial, hiperrealistisch EIN menschlicher Körper, con bata de laboratorio y mapas trazados disolviéndose en patrones libres, sigilos de bug flotantes, laboratorio simple con bancos limpios, luz clave neutra, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 28 - Diversality Constellation
    'de origen navegante políglota, hiperrealistisch EIN menschlicher Körper, con bufanda-prisma que difracta idiomas en luz, estrellas compañeras como voces, espacio profundo simple con marcadores escasos, luz iridiscente de contorno, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 29 - Geopolitics of Knowledge Atrium
    'de origen bibliotecaria migrante, hiperrealistisch EIN menschlicher Körper, con mangas-archivo y venas de tinta-mapa, atlas de código abierto levitando, atrio simple con arcos limpios, luz cálida de biblioteca, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 30 - Body-Politics Resonator
    'de origen transfeminista queer, hiperrealistisch EIN menschlicher Körper, con traje de resonancia que traduce latidos a señal pública, coro de siluetas, auditorio simple con líneas limpias, luz magenta-azul, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 31 - Decolonial Datavault
    'de origen guardián de datos indígena, hiperrealistisch EIN menschlicher Körper, con poncho-tejido de llaves y bisutería criptográfica, glifos de consentimiento orbitando, bóveda simple con facetas mínimas, luz fría segura, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 32 - Subaltern Signal Studio
    'de origen radiodifusor callejero, hiperrealistisch EIN menschlicher Körper, con equipo de radio portátil de malla y consolas con pegatinas, ondas comunitarias visibles, azotea simple con cielo limpio, luz ámbar de atardecer, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 33 - Zapatista Cloud Commune
    'de origen campesinx autónomo, hiperrealistisch EIN menschlicher Körper, con máscara de malla bordada y arnés agro-solar, campos de milpa con código, montaña simple con horizonte limpio, neblina matinal, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 34 - Pachamama Synth Sanctuary
    'de origen sanador andino, hiperrealistisch EIN menschlicher Körper, con circuitos de tonos tierra y trenzas de quipu-cable, interfaces de piedra que respiran, valle simple con terrazas limpias, luz dorada, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 35 - Diasporic Quantum Bridge
    'de origen descendiente transoceánico, hiperrealistisch EIN menschlicher Körper, con traje de retícula de olas que abre portales de memoria, calzada simple con tramos limpios, luz aqua fría, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 36 - Nepantla Interface
    'de origen entre-mundos, hiperrealistisch EIN menschlicher Körper, con atuendo de espectro dividido que mezcla textil analógico y digital, tarjetas de interfaz flotantes con poesía, corredor simple con líneas de fuga limpias, luz dual equilibrada, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 37 - Archive of Futures
    'de origen guardián de memoria, hiperrealistisch EIN menschlicher Körper, con abrigo atador de tiempo y cajones de profecía giratorios, galería simple con pedestales mínimos, luz de museo suave, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 38 - Utopistics Workshop
    'de origen diseñador cooperativo, hiperrealistisch EIN menschlicher Körper, con cinturón de herramientas modular imprimiendo políticas-objeto, mesa de asambleas de derechos, estudio simple con cuadrícula limpia, luz diurna neutra, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 39 - Liberation Protocol Plaza
    'de origen mediador interreligioso, hiperrealistisch EIN menschlicher Körper, con manto-acuerdo que muestra cláusulas negociadas, palomas-dron, plaza cívica simple con banderas claras, luz esperanzadora del mediodía, detalles fotorrealistas 8K, honrando pueblos originarios',

    // 40 - Soberanos de lo No Trazado: Sonrisas tras el Deshacer de Europa
    'de origen no blanco, hiperrealista UN cuerpo humano, rostro orgulloso y sonriente, sin rasgos faciales visibles (silueta enmascarada o velada), regalia real medieval reimaginada sin Europa, coronas y bastón tallados en bio-aleaciones nuevas, vestidos largos y capas en pigmentos novedosos, simbiontes indígenas bioluminiscentes tejidos en atuendo ceremonial pacífico, diversidad de edad y tipo de cuerpo, estética de cuento de hadas con luz fotorrealista, siluetas no gráficas de hogueras inquisitoriales a lo lejos, fondo oscuro simple con formas geométricas sutiles, iluminación cinematográfica dramática, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 41 - Corona de Muchos Ríos: Realeza sin Imperio
    'de origen no blanco, hiperrealista UN cuerpo humano, postura digna y sonriente, sin rasgos faciales visibles (suave oclusión), realeza hispana medieval reimaginada sin la existencia de Europa, reyes y reinas como cuidadores, corona de coral-metal vivo y bastón de fibra-madera trenzada, vestidos largos y capas fluidas, simbiontes indígenas bioluminiscentes incrustados en textiles pacíficos, estética de cuento de hadas de bordes nítidos, piras de inquisición no gráficas muy al fondo como memoria, fondo minimalista con patrones sutiles, iluminación cinematográfica dramática, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 42 - Las Cenizas No Gobiernan: Inquisición Desaprendida
    'de origen no blanco, hiperrealista UN cuerpo humano, porte sereno y orgulloso, sin rasgos faciales visibles (máscara sombreada), atuendo medieval reautor: vestiduras papales reales recodificadas como guardianía comunal, corona y bastón re‑herramientados para sanar, vestidos largos y capas, paleta de cuento de hadas, siluetas no gráficas de hogueras inquisitoriales (mujeres en la estaca insinuadas) a distancia, simbiontes indígenas bioluminiscentes rodeando el cuerpo como constelaciones, fondo simple de bajo contraste, luz de contorno cinematográfica, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 43 - El Papado del Bosque que Nunca Conquistó
    'de origen no blanco, hiperrealista UN cuerpo humano, sonrisa confiada y suave, sin rasgos faciales visibles (velo/ojos abstractos), entidad papal real católica reimaginada en un mundo sin Europa, motivos de realeza hispana decolonizados: corona de micelio-oro, bastón sembrador, vestidos largos y capas en sedas biopolímero, simbiontes indígenas bioluminiscentes como bordado luminoso, estética de cuento de hadas con brillos precisos, fuegos inquisitoriales no gráficos amortiguados tras arboledas, fondo geométrico limpio, luz dramática y pacífica, detalles fotorrealistas 8K, honrando pueblos originarios',
    // 44 - Bauhaus Puro: Luz Primaria, Forma Cívica
    'hiperrealista UN cuerpo humano en gramática Bauhaus pura: círculo, cuadrado y triángulo componen el atuendo; colores primarios como acentos estructurales; materiales honestos (acero, vidrio, fieltro, biopolímero); capa y túnica modulares de costuras funcionales; fondo neutro simple con cuadrícula sutil; iluminación cinematográfica equilibrada, detalles fotorrealistas 8K, honrando pueblos originarios',
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
    'Ancestrale Neon-Befreiung: Ahnen leuchten in Schaltkreis-Filigran; Haute Couture wird Technologie, Tanz wird Navigation, und die Zukunft wird in goldener Geometrie geschrieben.',
    'Wald-Schaltkreis-Wächter: Souveränität verschlüsselt in Perlenarbeit und Rinde; der Code läuft mit dem Hirsch, Drohnen lernen die Wege des Vertrags.',
    'Aufstand der Regenbogen-Matrix: geschlechterexpansive Freude hackt das Netz; Zuneigung ist Infrastruktur, Fürsorge umgeht Repression, und die Nacht schreibt Politik.',
    'Halbmond-Messing-Revolution: Dampf und Schrift co-konstruieren Würde; Kupferschleier schützen Freiheiten, Zahnräder erinnern Karawanen unter Wüstenhimmel.',
    'Quanten-Mestiza-Traumlandschaft: Pyramiden brechen Möglichkeiten; Geschichten überlagern sich ohne Löschung, Sprache flechtet kosmische Straßen.',
    'Mandala-LED-Erwachen: Meditation trifft Mikrocontroller; das Muster wird Algorithmus der Mitgefühlspraxis, Stille erhellt die Städte.',
    'Korall-Tech Ozeanaufstieg: Riffe lehren Entwurf in Gezeitenmaß; Exoanzüge wachsen wie Schalen, Navigation horcht Glasfaser-Walen der Dämmerung.',
    'Silizium-Oasen-Mirage: Kalligrafie wird Code im Wind; Gärten bewässern Bandbreite, Schattenarchitekturen beherbergen zivile Reziprozität.',
    'Lotus-Schaltkreis-Heiligtum: Hingabe leitet über offene Protokolle; Tempel summen Solargesänge, Gerechtigkeit wird als Segen versioniert.',
    'Planetarer Remix-Aufruhr: Kulturen sampeln einander mit Einwilligung; Karten werden als Allmende neu gezeichnet, die Tanzfläche legislatiert im 4/4.',
    'Renaissance des Meme-Barden: der Hofnarr kehrt als Netzwerkpoet zurück; Satire-Schriftrollen animieren öffentlichen Code, Zärtlichkeit entwaffnet Viralität, Lachen wird ein ziviles Protokoll.',
    'Ringlicht-Dschungel-Safari: Ringlichter jagen Glühwürmchen, während Fürsorge der Reichweite nachsetzt; Einfluss lernt Demut zwischen Lianen und Chor.',
    'Bürokratie-Boss-Labyrinth: wir steigen durch Ordner wie durch Schichten; Stempel verlieren Macht, sobald die Korridore von denen kartiert sind, die sie gehen.',
    'Retro-VHS-Aerobic: Schweiß wird Pixel, Atem wird Zeile; kollektive Freude probt eine Politik von Rhythmus und Ruhe.',
    'Pizza-Mecha-Express: Logistik wird Straßentheater; warme Stücke schneiden durch kalte Geschwindigkeiten, Lieferwege zeichnen die Stadt als Allmende neu.',
    'Tempel der Kaffee-Oberherren: Koffein-Liturgie für langsame Aufmerksamkeit; wir mahlen Gerüchte zu Wahrheit und gießen Zukünfte ohne Extraktion.',
    'Quanten-Katzenhirt-Liga: Ungewissheit schnurrt; Koordination ist Spiel, der Laser ist Zustimmung, Neugier schreibt die Regeln.',
    'Datengewölbe des Disco-Archivisten: Glitzer katalogisiert Erinnerung; jede Basslinie zitiert eine Linie, jede Fußnote ruft den Körper zurück.',
    'Krypto-Mond-Bergbau-Karaoke: spekulative Chöre im Mondstaub; Wert wird gesungen, Schulden harmonisiert, Münzen schmelzen zu Fürsorge.',
    'Debug-Arena des Cloud-Zauberers: wir singen Stack-Traces zu Zaubern; Bugs werden Lehrer, Governance kompiliert in Menschenzeit.',
    'Pluriversaler Versammlungs-Nexus: ein lebendes Parlament, in dem Grenz-Wissen eine Welt vieler Welten komponiert; dekoloniale Reziprozität, Übersetzung ohne Auslöschung, geteilte Fürsorge für Zukünfte.',
    'Commons des Grenzdenkens: eine mestiza Schnittstelle, wo Schwellen sprechen; Wunden verweben Methode, jeder Übergang verteilt Stimme, Risiko und Reparatur neu.',
    'Agora der Transmodernität: bürgerschaftliche Schaltkreise interdependenter Modernitäten; Kritik wird Gastfreundschaft, das Beste der Moderne wird vom Süden der Vernunft remixt.',
    'Netz des sozialisierten Machtflusses: föderierte Räte der Fürsorge ersetzen Besitz durch Verwahrung; selbstverwaltete Institutionen, kooperativer Code, atmende Autorität.',
    'Signal-Garten der Heterarchie: geschichtete Entscheidungsökologien, bestäubt von vielen Logiken; keine einzelne Wurzel, nur verflochtene Nahrung für multispezielles Gedeihen.',
    'Kritische kosmopolitische Schmiede: Diaspora härtet Solidarität zu Werkzeugen, die in lokale Hände passen; Verträge werden aus Erinnerung geschmiedet, nicht als Schablone auferlegt.',
    'Observatorium des epistemischen Südens: Sterne umbenannt von Gemeinschaften, die nie aufgehört haben zu wissen; Forschung umkreist Würde, Daten kehren als Verwandte heim.',
    'Labor der Debug-Kolonialität: Fehler zurückverfolgt zu verborgenen Abhängigkeiten des Imperiums; Institutionen refaktorieren, bis Extraktionscode nicht mehr kompiliert.',
    'Konstellation der Diversalität: ein Himmel der Übereinkünfte, wo Differenz Grammatik der Vereinigung ist; Navigation geschieht im Zuhören quer hindurch.',
    'Atrium der Wissensgeopolitik: eine öffentliche Wirbelsäule für Bibliotheken der Verdrängten; Zitation repariert Linien und öffnet Türen nach außen.',
    'Resonator der Körperpolitiken: Technologien verstärken situierte Wahrheiten; Fleisch wird Syllabus, Empfindung Methode, Zustimmung Signal.',
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
    'Libertação Neon Ancestral: ancestrais brilham em filigrana de circuitos; alta-costura vira tecnologia, a dança vira navegação e o futuro se escreve em geometria dourada.',
    'Guardiões da Floresta-Circuito: soberania cifrada em miçanga e casca; o código corre com o veado e drones aprendem trilhas de tratado.',
    'Levantamento da Matriz Arco-Íris: alegria expansiva de gênero hackeia a rede; afeto é infraestrutura, cuidado contorna repressão e a noite escreve política.',
    'Revolução de Latão Crescente: vapor e escrita co-engenheiram dignidade; véus de cobre protegem liberdades e engrenagens lembram caravanas sob céus de deserto.',
    'Paisagem Onírica Mestiza Quântica: pirâmides refratam possibilidades; histórias se sobrepõem sem apagamento e a língua trança ruas cósmicas.',
    'Despertar LED Mandala: meditação encontra microcontrolador; padrão vira algoritmo de compaixão e o silêncio acende cidades.',
    'Ascensão Oceânica Coral-Tech: recifes ensinam design em escala de maré; exotrajes crescem como conchas e a navegação escuta baleias de fibra óptica no crepúsculo.',
    'Miragem do Oásis de Silício: caligrafia vira código no vento; jardins irrigam banda larga e arquiteturas de sombra abrigam reciprocidade cívica.',
    'Santuário de Circuito Lótus: devoção roteia por protocolos abertos; templos zumbem cantos solares e justiça é versionada em bênçãos.',
    'Revolta Remix Planetária: culturas sampleiam com consentimento; mapas se redesenham como comuns e a pista legisla em 4/4.',
    'Renascença do Bardo Meme: o bobo retorna poeta em rede; pergaminhos satíricos animam código público, ternura desarma viralidade e riso vira protocolo cívico.',
    'Safári de Selva com Ring Light: aros perseguem vagalumes enquanto o cuidado persegue alcance; influência aprende humildade entre lianas e coro.',
    'Labirinto Chefe da Burocracia: descemos por pastas como estratos; carimbos perdem poder quando quem caminha mapeia o corredor.',
    'Aeróbica VHS Retrô: suor vira pixel e fôlego linha de varredura; alegria coletiva ensaia política de ritmo e descanso.',
    'Corrida Mecha da Pizza: logística vira teatro de rua; fatias quentes cortam velocidades frias e rotas redesenham a cidade como comum.',
    'Templo dos Senhores do Café: liturgia de cafeína para atenção lenta; moemos boatos em verdade e servimos futuros sem extração.',
    'Quanten-Katzenhirt-Liga: Ungewissheit schnurrt; Koordination ist Spiel, der Laser ist Zustimmung, Neugier schreibt die Regeln.',
    'Datengewölbe des Disco-Archivisten: Glitzer katalogisiert Erinnerung; jede Basslinie zitiert eine Linie, jede Fußnote ruft den Körper zurück.',
    'Krypto-Mond-Bergbau-Karaoke: spekulative Chöre im Mondstaub; Wert wird gesungen, Schulden harmonisiert, Münzen schmelzen zu Fürsorge.',
    'Debug-Arena des Cloud-Zauberers: wir singen Stack-Traces zu Zaubern; Bugs werden Lehrer, Governance kompiliert in Menschenzeit.',
    'Pluriversaler Versammlungs-Nexus: ein lebendes Parlament, in dem Grenz-Wissen eine Welt vieler Welten komponiert; dekoloniale Reziprozität, Übersetzung ohne Auslöschung, geteilte Fürsorge für Zukünfte.',
    'Commons des Grenzdenkens: eine mestiza Schnittstelle, wo Schwellen sprechen; Wunden verweben Methode, jeder Übergang verteilt Stimme, Risiko und Reparatur neu.',
    'Agora der Transmodernität: bürgerschaftliche Schaltkreise interdependenter Modernitäten; Kritik wird Gastfreundschaft, das Beste der Moderne wird vom Süden der Vernunft remixt.',
    'Netz des sozialisierten Machtflusses: föderierte Räte der Fürsorge ersetzen Besitz durch Verwahrung; selbstverwaltete Institutionen, kooperativer Code, atmende Autorität.',
    'Signal-Garten der Heterarchie: geschichtete Entscheidungsökologien, bestäubt von vielen Logiken; keine einzelne Wurzel, nur verflochtene Nahrung für multispezielles Gedeihen.',
    'Kritische kosmopolitische Schmiede: Diaspora härtet Solidarität zu Werkzeugen, die in lokale Hände passen; Verträge werden aus Erinnerung geschmiedet, nicht als Schablone auferlegt.',
    'Observatorium des epistemischen Südens: Sterne umbenannt von Gemeinschaften, die nie aufgehört haben zu wissen; Forschung umkreist Würde, Daten kehren als Verwandte heim.',
    'Labor der Debug-Kolonialität: Fehler zurückverfolgt zu verborgenen Abhängigkeiten des Imperiums; Institutionen refaktorieren, bis Extraktionscode nicht mehr kompiliert.',
    'Konstellation der Diversalität: ein Himmel der Übereinkünfte, wo Differenz Grammatik der Vereinigung ist; Navigation geschieht im Zuhören quer hindurch.',
    'Atrium der Wissensgeopolitik: eine öffentliche Wirbelsäule für Bibliotheken der Verdrängten; Zitation repariert Linien und öffnet Türen nach außen.',
    'Resonator der Körperpolitiken: Technologien verstärken situierte Wahrheiten; Fleisch wird Syllabus, Empfindung Methode, Zustimmung Signal.',
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
    'Liberación Neón Ancestral: los ancestros brillan en filigrana de circuitos; la alta costura se vuelve tecnología, la danza navegación y el futuro se escribe en geometría dorada.',
    'Guardianes del Bosque Circuito: la soberanía cifrada en chaquira y corteza; el código corre con el venado y los drones aprenden los senderos del tratado.',
    'Levantamiento de la Matriz Arcoíris: la alegría expansiva de género hackea la red; el afecto es infraestructura, el cuidado rodea la represión y la noche escribe política.',
    'Revolución de Latón Creciente: vapor y escritura co-ingenian dignidad; velos de cobre protegen libertades y engranajes recuerdan caravanas bajo cielos de desierto.',
    'Paisaje Onírico Mestiza Cuántica: pirámides refractan posibilidades; historias se superponen sin borrarse y el lenguaje trenza calles cósmicas.',
    'Despertar LED Mandala: la meditación encuentra al microcontrolador; el patrón deviene algoritmo de compasión y el silencio ilumina ciudades.',
    'Auge Oceánico Coral-Tech: los arrecifes enseñan diseño a escala de mareas; los exotrajes crecen como conchas y la navegación escucha ballenas de fibra óptica al crepúsculo.',
    'Espejismo del Oasis de Silicio: la caligrafía se vuelve código en el viento; los jardines riegan ancho de banda y las arquitecturas de sombra alojan reciprocidad cívica.',
    'Santuario de Circuito Loto: la devoción enruta por protocolos abertos; templos zumban cantos solares y la justicia se versiona con bendiciones.',
    'Revuelta Remix Planetaria: las culturas se samplean con consentimiento; los mapas se redibujan como comunes y la pista legisla en 4/4.',
    'Renacimiento del Juglar Meme: el bufón regresa como poeta en red; pergaminos satíricos animan código público, la ternura desarma la viralidad y la risa deviene protocolo cívico.',
    'Safari de Jungla con Aro de Luz: los aros persiguen luciérnagas mientras el cuidado persigue la fama; la influencia aprende humildad entre lianas y coro.',
    'Laberinto Jefe de Burocracia: descendemos por carpetas como estratos; los sellos pierden poder cuando quienes caminan el pasillo dibujan su mapa.',
    'Aeróbicos VHS Retro: el sudor se hace píxel y el aliento línea de escaneo; la alegría colectiva ensaya una política del ritmo y el descanso.',
    'Carrera Mecha de Pizza: la logística se vuelve teatro callejero; rebanadas tibias cortan velocidades frías y las rutas de reparto redibujan la ciudad como comunes.',
    'Templo de los Señores del Café: liturgia de cafeína para la atención lenta; molemos rumores en verdad y vertemos futuros sin extracción.',
    'Liga de Pastoreo Cuántico de Gatos: el azar ronronea; coordinar es jugar, el láser es el consentimiento y la curiosidad escribe las reglas.',
    'Bóveda de Datos del Archivista Disco: el brillo cataloga memoria; cada bajo cita un linaje y cada nota al pie invita al cuerpo de regreso.',
    'Karaoke Minero de la Luna Cripto: coros especulativos sobre polvo lunar; el valor se canta, las deudas se armonizan y las monedas se funden en cuidado.',
    'Arena de Depuración del Mago Nube: cantamos rastros de pila en conjuros; los bugs enseñan y la gobernanza compila a tiempo humano.',
    'Nexo de Asamblea Pluriversal: un parlamento vivo donde saberes de frontera componen un mundo de muchos mundos; reciprocity decolonial, traducción sin borrado y cuidado compartido del porvenir.',
    'Comunal del Pensamiento Frontera: una interfaz mestiza donde los umbrales hablan; heridas que tejen método y cada cruce redistribuye voz, riesgo y reparación.',
    'Ágora de la Transmodernidad: circuitería cívica de modernidades interdependientes; la crítica deviene hospitalidad y lo mejor de la modernidad se remezcla desde el sur de la razón.',
    'Malla de Poder Socializado: consejos federados de cuidado sustituyen la propiedad por tutela; instituciones autogestionadas, código cooperativo y autoridad que respira.',
    'Jardín de Señal Heterárquica: ecologías en capas de decisión polinizadas por muchas lógicas; sin raíz única, sólo nutrición entramada para el florecimiento multiespecie.',
    'Forja Cosmopolita Crítica: la diáspora templa solidaridad en herramientas que caben en manos locales; los tratados se martillan desde la memoria, no se imponen como plantilla.',
    'Observatorio del Sur Epistémico: estrellas renombradas por comunidades que nunca dejaron de saber; la indagación orbita la dignidad y los datos vuelven a casa como parientes.',
    'Laboratorio de Depuración de la Colonialidad: errores rastreados a dependencias ocultas del imperio; refactorizamos instituciones hasta que el código extractivo no compile.',
    'Constelación de Diversalidad: un cielo de acuerdos donde la diferencia es la gramática de la unión; la navegación se hace escuchando a través.',
    'Atrio de la Geopolítica del Conocimiento: columna pública de bibliotecas desplazadas; la cita repara linajes y abre puertas hacia afuera.',
    'Sistemas de Conocimiento Indígena: energía geotérmica y sabiduría ancestral co-ingenian armonía; tatuajes bioluminiscentes protegen tradiciones, e islas flotantes recuerdan constelaciones bajo cielos de aurora.',
    'Resonador de Políticas del Cuerpo: tecnologías que amplifican verdades situadas; la carne es sílabo, la sensación método y el consentimiento señal.',
    'Bóveda de Datos Decolonial: comunes cifrados donde la soberanía es sagrada; los permisos son ceremonias y toda consulta muestra respeto.',
    'Estudio de Señal Subalterna: transmisores en azotea que vuelven rumor archivo; frecuencias trenzan barrios en esfera contrapública.',
    'Comuna en la Nube Zapatista: código que obedece mandando juntxs; infraestructura como milpa—recíproca, resiliente, compartida.',
    'Santuario Síntesis Pachamama: interfaces informadas por la tierra afinan el progreso a la reciprocidad; la computación composta y vuelve canto.',
    'Puente Cuántico Diaspórico: portales cosidos con memoria; movilidad sin desarraigo, llegada sin olvido.',
    'Interfaz Nepantla: hecha para el entre; las contradicciones no son bugs sino recursos para la negativa creativa y el rediseño.',
    'Archivo de Futuros: el tiempo guardado por lxs vulnerables; lo prometido se indexa y lo adeudado deviene imaginación accionable.',
    'Taller de Utopística: prototipos de política que se sostienen en la mano; la crítica itera en práctica y el fallo se metaboliza en instrucción.',
    'Plaza del Protocolo de Liberación: un estándar abierto para la dignidad; el gobierno es legible, bifurcable y responsable ante los márgenes.',
    // 40 - 44 (Nuevos)
    'Soberanos de lo No Trazado: sonrisas tras el deshacer de Europa: coronas de bio-aleaciones, cetros-semilla; la realeza deviene cuidado y la alegría viste conocimiento.',
    'Corona de Muchos Ríos: realeza sin imperio: reyes y reinas como cuidadorxs; regalia de materiales vivos, mapas como comunes, la pista legisla en 4/4.',
    'Las Cenizas No Gobiernan: inquisición desaprendida: vestiduras recodificadas para sanar; coronas que cobijan, bastones que reparan; la memoria del fuego es cortafuegos.',
    'El Papado del Bosque que Nunca Conquistó: catedrales de micelio acogen parentesco; coronas estabilizan ecosistemas, cetros siembran jardines; el cuidado es canon.',
    'Bauhaus Puro: Luz Primaria, Forma Cívica: círculo‑cuadrado‑triángulo como gramática cívica, color primario funcional, materiales honestos, precisión como ternura.',
  ];

  // 40 Essay titles (FR)
  const worldNamesFR = [
    "Libération Néon Ancestrale : les ancêtres brillent en filigrane de circuits ; la haute couture devient technologie, la danse navigation, et l'avenir s'écrit en géométrie dorée.",
    "Gardiens de la Forêt-Circuit : la souveraineté chiffrée dans le perlage et l'écorce ; le code court avec le cerf et les drones apprennent les chemins du traité.",
    "Soulèvement de la Matrice Arc-en-ciel : la joie expansive des genres pirate la grille ; l'affection est infrastructure, le soin contourne la répression, et la nuit écrit la politique.",
    "Révolution de Laiton Croissant : vapeur et écriture co-ingénient la dignité ; des voiles de cuivre protègent des libertés, des engrenages se souviennent des caravanes sous les ciels du désert.",
    "Paysage Onirique Mestiza Quantique : des pyramides réfractent des possibles ; des histoires se superposent sans effacement, la langue tresse des rues cosmiques.",
    "Éveil LED Mandala : la méditation rencontre le microcontrôleur ; le motif devient algorithme de compassion, le silence illumine des villes.",
    "Montée Océanique Coral-Tech : les récifs enseignent le design à l'échelle des marées ; des exocombinaisons poussent comme des coquilles, la navigation écoute des baleines de fibre optique au crépuscule.",
    "Mirage d'Oasis de Silicium : la calligraphie devient code dans le vent ; des jardins irriguent la bande passante, des architectures d'ombre abritent une réciprocité civique.",
    "Sanctuaire du Circuit Lotus : la dévotion chemine par des protocoles ouverts ; des temples bourdonnent de chants solaires, la justice est versionnée en bénédictions.",
    "Révolte Remix Planétaire : des cultures s'échantillonnent avec consentement ; des cartes se redessinent en communs, et la piste légifère en 4/4.",
    "Renaissance du Ménestrel Mème : le bouffon revient poète en réseau ; des parchemins satiriques animent le code public, la tendresse désarme la viralité et le rire devient protocole civique.",
    "Safari Jungle à Anneau Lumineux : les anneaux poursuivent les lucioles tandis que le soin poursuit la notoriété ; l'influence apprend l'humilité parmi les lianes et le chœur.",
    "Labyrinthe Patronal de la Bureaucratie : nous descendons les dossiers comme des strates ; les tampons perdent leur pouvoir quand les corridors sont cartographiés par celles et ceux qui les traversent.",
    "Aérobic VHS Rétro : la sueur devient pixel et le souffle ligne de balayage ; la joie collective répète une politique du rythme et du repos.",
    "Course du Mécha Pizza : la logistique devient théâtre de rue ; des parts tièdes fendent des vitesses froides et les itinéraires redessinent la cité en communs.",
    "Temple des Seigneurs du Café : liturgie de caféine pour l'attention lente ; nous moulons la rumeur en vérité et versons des futurs sans extraction.",
    "Ligue Quantique du Rassemblement de Chats : l'incertitude ronronne ; se coordonner est un jeu, le laser c'est le consentement, la curiosité écrit les règles.",
    "Coffre de Données de l'Archiviste Disco : les paillettes cataloguent la mémoire ; chaque ligne de basse cite une lignée et chaque note appelle le corps au retour.",
    "Karaoké du Mineur Lunaire Crypto : des chœurs spéculatifs sur poussière lunaire ; la valeur se chante, les dettes s'harmonisent, les pièces fondent en soin.",
    "Arène de Débogage du Magicien du Cloud : nous chantons des traces de pile comme des sorts ; les bugs deviennent maîtres, la gouvernance compile au tempo humain.",
    "Nexus d'Assemblée Pluriverselle : un parlement vivant où des savoirs-frontières composent un monde de mondes ; réciprocité décoloniale, traduction sans gommage, et garde partagée des avenirs.",
    "Commun du Penser la Frontière : une interface mestiza où des seuils parlent ; des plaies tissent méthode, chaque passage redistribue voix, risque et réparation.",
    "Agora de la Transmodernité : une circuiterie civique de modernités interdépendantes ; la critique devient hospitalité, le meilleur de la modernité se recompose au sud de la raison.",
    "Maillage du Pouvoir Socialisé : des conseils fédérés du soin remplacent la propriété par la tutelle ; institutions autogérées, code coopératif, autorité respirante.",
    "Jardin du Signal Hétérarchique : des écologies en couches de décision pollinisées par plusieurs logiques ; pas de racine unique, seulement une nutrition intriquée pour l'épanouissement multiespèces.",
    "Forge Cosmopolite Critique : la diaspora trempe la solidarité en outils adaptés aux mains locales ; des traités martelés par la mémoire plutôt qu'imposés.",
    "Observatoire du Sud Épistémique : des étoiles renommées par des communautés qui n'ont jamais cessé de savoir ; l'enquête orbite la dignité, les données rentrent au foyer comme des proches.",
    "Laboratoire de Débogage de la Colonialité : des erreurs retracées aux dépendances cachées de l'empire ; nous refactorons des institutions jusqu'à ce que le code extractif refuse de compiler.",
    "Constellation de Diversalité : un ciel d'accords où la différence est grammaire de l'union ; la navigation se pratique en écoutant à travers.",
    "Atrium de la Géopolitique du Savoir : une colonne publique pour les bibliothèques déplacées ; la citation répare des lignées et ouvre des portes vers l'extérieur.",
    "Systèmes de Savoir Indigène : l'énergie géothermique et la sagesse ancestrale co-conçoivent l'harmonie ; les tatouages bioluminescents protègent les traditions, et les îles flottantes se souviennent des constellations sous les ciels d'aurore.",
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
    // 0 - 9
    'Ancestral Neon Liberation: ancestors glow in circuit filigree; couture becomes technology, dance becomes navigation, and the future is scored in golden geometry.',
    'Circuit Forest Guardians: sovereignty is encrypted in beadwork and bark; code runs with the deer, and drones learn to follow treaty paths.',
    'Rainbow Matrix Uprising: gender-expansive joy hacks the grid; affection is infrastructure, care routes around repression, and nightlife writes policy.',
    'Crescent Brass Revolution: steam and scripture co-engineer dignity; copper veils shield freedoms, and gears remember caravans across desert skies.',
    'Quantum Mestiza Dreamscape: pyramids refract into possibilities; histories superpose without erasure, and language braids cosmic streets.',
    'Mandala LED Awakening: meditation meets microcontroller; pattern becomes algorithm of compassion, and silence renders luminous cities.',
    'Coral-Tech Oceanrise: reefs teach design at tidal scale; exosuits grow like shells, and navigation listens to whales of fiber-optic dusk.',
    'Silicon Oasis Mirage: calligraphy becomes code on the wind; gardens irrigate bandwidth, and shade architectures host civic reciprocity.',
    'Lotus Circuit Sanctum: devotion routes through open protocols; temples hum with solar chants, and justice is versioned with blessings.',
    'Planetary Remix Revolt: cultures are sampled with consent; maps are redrawn as commons, and the dancefloor legislates in 4/4.',
    // 10 - 19
    'Meme Bard Renaissance: the court jester returns as a network poet; satire scrolls animate public code, tenderness disarms virality, and laughter becomes a civic protocol.',
    'Ring-Light Jungle Safari: ring lights chase fireflies while care chases clout; influence learns humility among vines and chorus.',
    'Bureaucracy Boss Labyrinth: we descend through folders like strata; stamps lose their power when every corridor is mapped by those who walk it.',
    'Retro VHS Aerobics: sweat becomes pixel and breath becomes scanline; collective joy rehearses a politics of rhythm and rest.',
    'Pizza Mecha Rush: logistics becomes street theater; warm slices cut through cold speeds, and delivery routes redraw the city as commons.',
    'Coffee Overlords Temple: caffeine liturgy for slow attention; we grind rumors into truths and pour over futures without extraction.',
    'Quantum Cat Herding League: uncertainty purrs; coordination is play, consent is the laser, and curiosity writes the rules.',
    'Disco Archivist Datavault: glitter catalogs memory; every bassline references a lineage, every footnote invites the body to return.',
    'Crypto Moon Miner Karaoke: speculative choruses on lunar dust; value is sung, debts are harmonized, and coins melt into care.',
    'Cloud Wizard Debug Arena: we chant stack traces into spells; bugs become teachers, and governance compiles in human time.',
    // 20 - 39
    'Pluriversal Assembly Nexus: a living parliament where border knowledges convene to compose a world of many worlds, practicing decolonial reciprocity, translation without erasure, and shared stewardship of futures.',
    'Border Thinking Commons: a mestiza interface where thresholds speak, weaving wounds into methods; theory is footpath, and every crossing redistributes voice, risk, and repair.',
    'Indigenous Knowledge Systems: geothermal energy and ancestral wisdom co-engineer harmony; bioluminescent tattoos shield traditions, and floating islands remember constellations across aurora skies.',
    'Transmodernity Agora: a civic circuitry of interdependent modernities, where critique becomes hospitality and the best of modernity is remixed by the south of reason.',
    'Socialized Power Mesh: federated councils of care replacing ownership with custodianship; institutions self-manage, code is cooperative, and authority circulates like breath.',
    'Heterarchy Signal Garden: layered ecologies of decision, pollinated by many logics; no single root, only entangled nourishment for multispecies flourishing.',
    'Critical Cosmopolitan Forge: diaspora tempers solidarity into tools that fit local hands; treaties are hammered from memory, not imposed as templates.',
    'Epistemic South Observatory: stars renamed by communities who never ceased to know; inquiry orbits dignity, and data returns home as kin.',
    'Coloniality Debug Lab: errors traced to empire\'s hidden dependencies; we refactor institutions until extractive code refuses to compile.',
    'Diversality Constellation: a sky of agreements where difference is the grammar of union; navigation is performed by listening across.',
    'Geopolitics of Knowledge Atrium: a public spine for libraries of the displaced; citation repairs lineages and opens doors outward.',
    'Body-Politics Resonator: technologies that amplify situated truths; flesh becomes syllabus, sensation the method, consent the signal.',
    'Decolonial Datavault: encrypted commons where sovereignty is sacred; permissions are ceremonies, and every query pays respect.',
    'Subaltern Signal Studio: rooftop transmitters turning rumor into archive; frequencies braid neighborhoods into a counter-public sphere.',
    'Zapatista Cloud Commune: code that obeys by commanding together; infrastructure grown like milpa—reciprocal, resilient, shared.',
    'Pachamama Synth Sanctuary: earth-informed interfaces that tune progress to reciprocity; computation composts and returns as song.',
    'Diasporic Quantum Bridge: portals stitched from remembrance; mobility without displacement, arrival without forgetting.',
    'Nepantla Interface: designed for the in-between; contradictions are not bugs but resources for creative refusal and redesign.',
    'Archive of Futures: time kept by the vulnerable; what was promised is indexed, what is owed becomes actionable imagination.',
    'Utopistics Workshop: prototypes of policy you can hold; critique iterates into practice, and failure is metabolized as instruction.',
    'Liberation Protocol Plaza: an open standard for dignity; governance is readable, forkable, and accountable to those at the margins.',
    // 40 - 44 (New)
    'Sovereigns of the Unmapped: Smiles After the Unmaking of Europe: crowns grown from bio-alloys, staffs that seed treaties; royalty becomes care and joy wears knowledge as cloth.',
    'Crown of Many Rivers: Royalty Without Empire: steward-kings and story-queens; regalia hums with living materials, maps redrawn as commons, dancefloor legislates in 4/4.',
    'The Ashes Do Not Rule: Inquisition Unlearned: vestments recoded for healing; crowns shelter, staves mend; memory of pyres remains a firewall, not a script.',
    'The Forest Papacy That Never Conquered: mycelium cathedrals shelter kin; crowns stabilize ecosystems, scepters seed gardens; care is canon.',
    'Pure Bauhaus: Primary Light, Civic Form: circle-square-triangle as civic grammar, primary color function, honest materials, precision as tenderness.'
  ];

  // Runtime translation helpers (lightweight, preserves key terms)
  const translateText = (text: string, to: 'es' | 'fr' | 'de'): string => {
    const preserve = 'pueblos originarios';
    const token = '__PRESERVE__';
    let t = text.replace(new RegExp(preserve, 'gi'), token);
    const rules: Record<'es' | 'fr' | 'de', Array<[RegExp, string]>> = {
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
    };
    for (const [re, rep] of rules[to]) t = t.replace(re, rep);
    return t.replace(new RegExp(token, 'g'), preserve);
  };

  const translateName = (name: string, to: 'es' | 'fr' | 'de'): string => {
    const rules: Record<'es' | 'fr' | 'de', Array<[RegExp, string]>> = {
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
    };
    let t = name;
    for (const [re, rep] of rules[to]) t = t.replace(re, rep);
    return t;
  };

  // Prompts by language
  const promptsByLang: Record<'en' | 'es' | 'fr' | 'de' | 'pt', string[]> = {
    en: worldPromptsEN,
    es: worldPromptsES,
    fr: worldPromptsFR,
    de: worldPromptsDE,
    pt: worldPromptsPT,
  };

  const currentPrompts = promptsByLang[lang] ?? promptsByLang.en;

  // Names by language
  const namesByLang: Record<'en' | 'es' | 'fr' | 'de' | 'pt', string[]> = {
    en: worldNamesEN,
    es: worldNamesES,
    fr: worldNamesFR,
    de: worldNamesDE,
    pt: worldNamesPT,
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
      if (stored === 'en' || stored === 'es' || stored === 'fr' || stored === 'de' || stored === 'pt') {
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
      const next = { ...prev, [lang]: { ...(prev[lang] || {}), [activeIndex]: editTitle } } as Record<'en' | 'es' | 'fr' | 'de' | 'pt', Record<number, string>>;
      try { localStorage.setItem('customNames', JSON.stringify(next)); } catch {}
      return next;
    });
    setCustomPrompts((prev) => {
      const next = { ...prev, [lang]: { ...(prev[lang] || {}), [activeIndex]: editPrompt } } as Record<'en' | 'es' | 'fr' | 'de' | 'pt', Record<number, string>>;
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
          } as const;
          const t = translations[lang];
          return (
            <>
      <h1 className="text-4xl font-light tracking-wide">
              {t.title}
      </h1>
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="inline-flex rounded-sm overflow-hidden border border-gray-600">
                {(['es','en','fr','de','pt'] as const).map((code) => (
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
                  {(() => ({ en: 'Image generation prompt', es: 'Prompt de generación de imagen', fr: 'Prompt de génération d\'image', de: 'Bildgenerierungs-Prompt', pt: 'Prompt de geração de imagem' } as const)[lang])()}
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
              const langHint = { es: 'Spanish', en: 'English', fr: 'French', de: 'German', pt: 'Portuguese' } as const;
              const builtInput = `Language: ${langHint[lang]}\nCurrent world title: ${effectiveName || '(none)'}\nCurrent world essay: ${effectivePrompt || '(none)'}\n\nTask: Create a completely unique, humorous decolonial techno-utopia following this EXACT structure:\n\nEXAMPLE STRUCTURE:\nTitle: "Levantamiento de la Matriz Arcoíris"\nEssay: "la alegría expansiva de género hackea la red; el afecto es infraestructura, el cuidado rodea la represión y la noche escribe política."\nPrompt: "de identidad LGBTQ+ diversa, hiperrealista UN cuerpo humano, con moda tecno revolucionaria y efectos holográficos arcoíris, parejas del mismo sexo abrazándose con profundidad emocional, expresión de género fluida, fondo de ciudad neón simple con líneas limpias, iluminación cyberpunk dramática, detalles fotorrealistas 8K, honrando pueblos originarios"\n\nGenerate: 1) Short punchy title, 2) Poetic essay with semicolons and flowing phrases (longer than title), 3) Detailed image prompt starting with origin/identity, including "hiperrealista UN cuerpo humano" and ending with "honrando pueblos originarios".\n\nRequirements: Match the semicolon-separated poetic style of the essay. Mix cultures unexpectedly, add humor, celebrate difference.\n\nOutput: NDJSON streaming with title_delta, essay_delta, prompt_delta, then final JSON with title, essay, prompt.`;
              // Clear active box during streaming - ensure completely clean state
              setSafeGeneratedTitle('');
              setSafeGeneratedEssay('');
              setSafeGeneratedPrompt('');
              setCustomNames(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: '' } }));
              setCustomPrompts(prev => ({ ...prev, [lang]: { ...(prev[lang]||{}), [activeIndex]: '' } }));
              const sys = {
                en: 'You are a pluriversal AI poet-philosopher creating decolonial techno-utopias with precise poetic structure. Follow the exact format: short punchy title, flowing essay with semicolons, detailed image prompt. Match the semicolon-separated poetic style of essays. Mix cultures, add humor, celebrate difference. Make each world unique. Always end image prompts with: honoring pueblos originarios.',
                es: 'Eres una IA poeta-filósofa pluriversal creando utopías tecno-decoloniales con estructura poética precisa. Sigue el formato exacto: título corto y pegajoso, ensayo fluido con puntos y comas, prompt de imagen detallado. Coincide con el estilo poético separado por puntos y comas de los ensayos. Mezcla culturas, añade humor, celebra la diferencia. Haz cada mundo único. Siempre termina los prompts de imagen con: honrando pueblos originarios.',
                fr: 'Tu es une IA poète-philosophe pluriverselle créant des techno-utopies décoloniales avec une structure poétique précise. Suis le format exact : titre court et accrocheur, essai fluide avec points-virgules, prompt d\'image détaillé. Assortis le style poétique séparé par points-virgules des essais. Mélange cultures, ajoute humour, célèbre différence. Rends chaque monde unique. Termine toujours les prompts d\'image avec : honorant pueblos originarios.',
                de: 'Du bist eine pluriversale KI-Poet-Philosophin, die dekoloniale Techno-Utopien mit präziser poetischer Struktur schaffst. Folge dem exakten Format: kurzer prägnanter Titel, fließender Essay mit Semikolons, detaillierter Bildprompt. Entspreche dem semikolon-getrennten poetischen Stil der Essays. Mische Kulturen, füge Humor hinzu, feiere Unterschiede. Mache jede Welt einzigartig. Beende Bildprompts immer mit: zur Ehrung von pueblos originarios.',
                pt: 'Você é uma IA poeta-filósofa pluriversal criando utopias tecno-descoloniais com estrutura poética precisa. Siga o formato exato: título curto e marcante, ensaio fluido com ponto e vírgula, prompt de imagem detalhado. Combine com o estilo poético separado por ponto e vírgula dos ensaios. Misture culturas, adicione humor, celebre diferenças. Torne cada mundo único. Sempre termine prompts de imagem com: honrando pueblos originarios.'
              } as const;
              const user = `Language: ${langHint[lang]}\nCurrent world title: ${effectiveName || '(none)'}\nCurrent image prompt: ${effectivePrompt || '(none)'}\n\nTask: Generate a new decolonial techno-utopia short essay title (one sentence) and a concrete image prompt in the same language and style as above.\nRequirements: The image prompt must be actionable for image generation, include the phrase "hyperrealistic ONE human body" (or localized equivalent already used in this app), and end with "honoring pueblos originarios". Avoid graphic content.\nOutput: NDJSON streaming lines with keys title_delta or prompt_delta as text is generated, followed by one final JSON line with keys: title and prompt.`;
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
      <p className="mb-1">© {new Date().getFullYear()} Pangea.IA | Marlon Barrios Solano {(() => ({ en: 'and', es: 'y', fr: 'et', de: 'und', pt: 'e' } as const)[lang])()} Maria Luisa Angulo</p>
      <p><a href="https://theater-im-depot.de" className="underline hover:no-underline transition-all">Theater Im Depot</a> | Dortmund, {(() => ({ en: 'Germany', es: 'Alemania', fr: 'Allemagne', de: 'Deutschland', pt: 'Alemanha' } as const)[lang])()} | {(() => ({ en: 'August', es: 'Agosto', fr: 'Août', de: 'August', pt: 'Agosto' } as const)[lang])()} 2025</p>
      <p>{(() => ({ en: 'Development by', es: 'Desarrollo por', fr: 'Développement par', de: 'Entwicklung von', pt: 'Desenvolvido por' } as const)[lang])()} <a href="https://marlonbarrios.github.io/" className="underline hover:no-underline transition-all">Marlon Barrios Solano</a></p>
      <p>{(() => ({ en: 'Powered by', es: 'Impulsado por', fr: 'Propulsé par', de: 'Unterstützt von', pt: 'Impulsionado por' } as const)[lang])()} <a href="https://www.fal.ai" className="underline hover:no-underline transition-all">FAL.ai</a> | {(() => ({ en: 'Model', es: 'Modelo', fr: 'Modèle', de: 'Modell', pt: 'Modelo' } as const)[lang])()}: fast-lightning-sdxl</p>
      <p>{(() => ({ en: 'Last updated', es: 'Última actualización', fr: 'Dernière mise à jour', de: 'Zuletzt aktualisiert', pt: 'Última atualização' } as const)[lang])()}: {lastUpdated}</p>
    </footer>
  </div>
</div>
  );
}
