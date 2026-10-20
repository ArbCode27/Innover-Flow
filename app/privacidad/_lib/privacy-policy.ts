export const PRIVACY_LAST_UPDATED = "8 de octubre de 2026";
export const PRIVACY_CONTROLLER = "Conexiones Innover";
export const PRIVACY_PRODUCT = "Innover Flow";
export const PRIVACY_TAX_ID = "J-50316437-9";

export type PrivacySection = {
  id: string;
  title: string;
  summary: string;
  paragraphs: string[];
  bullets?: string[];
  paragraphsAfter?: string[];
};

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: "responsable",
    title: "1. Quién es el responsable",
    summary: "Identidad del operador",
    paragraphs: [
      `${PRIVACY_CONTROLLER}, RIF ${PRIVACY_TAX_ID}, opera ${PRIVACY_PRODUCT}, un CRM de atención al cliente por aplicación móvil para gestionar conversaciones, clientes, tickets, cobranza y pagos de servicios de internet.`,
      "Esta política aplica a las personas que usan la app móvil de atención conectada a la plataforma, a los asesores que usan el CRM y a las organizaciones que configuran su propio canal de atención.",
      `Cuando una organización o sucursal opera su propio canal dentro de la plataforma, esa organización también trata los datos de sus clientes para prestar el servicio. En ese caso, ${PRIVACY_CONTROLLER} actúa como proveedor tecnológico y la organización como responsable del trato cotidiano con sus usuarios.`,
    ],
  },
  {
    id: "alcance",
    title: "2. Alcance y servicios cubiertos",
    summary: "Qué cubre esta política",
    paragraphs: [
      "Esta política cubre el tratamiento de datos personales realizado a través de:",
    ],
    bullets: [
      "La aplicación móvil de atención al cliente y sus endpoints propios de Innover Flow.",
      "El CRM web usado por asesores y administradores para atender chats, tickets y pagos.",
      "Integraciones necesarias para identificar al cliente, consultar facturación y registrar pagos.",
    ],
  },
  {
    id: "datos",
    title: "3. Datos que recopilamos",
    summary: "Información de la app y del CRM",
    paragraphs: [
      "Recopilamos únicamente la información necesaria para atenderte y operar el servicio. Según cómo te comuniques, podemos tratar:",
    ],
    bullets: [
      "Identificadores de contacto: número de teléfono, nombre y, si aplica, identificadores de la app.",
      "Contenido de los mensajes: texto, respuestas rápidas y notas internas del equipo.",
      "Archivos multimedia que envíes o recibas: imágenes, audios, videos, documentos y su nombre de archivo.",
      "Ubicación, solo si decides compartir un mensaje de ubicación desde la app.",
      "Datos de cliente asociados al chat: nombre, cédula u otro identificador, teléfono, estado de cuenta, plan y contrato cuando se vincula con el sistema de gestión (Wispro).",
      "Información de pagos: montos, referencias, capturas o comprobantes de transferencia y el resultado de la revisión.",
      "Datos de tickets y órdenes de trabajo: tipo de reporte, estado, historial de atención y asignación.",
      "Datos de asesores y administradores: nombre, correo, rol, departamento y preferencias de la interfaz.",
      "Datos técnicos del servicio: tokens de dispositivo para notificaciones, horarios y registros de error necesarios para operar el canal.",
    ],
  },
  {
    id: "origen",
    title: "4. Cómo obtenemos los datos",
    summary: "Origen de la información",
    paragraphs: [
      "Los datos llegan por estos caminos:",
    ],
    bullets: [
      "Directamente de ti cuando escribes, envías un comprobante o compartes un dato desde la app móvil.",
      "Desde el sistema de gestión del proveedor de internet (Wispro), si un asesor vincula tu cédula o contrato al chat.",
      "Desde el equipo de atención, cuando un asesor registra una nota, etiqueta, ticket o decisión de pago.",
      "Desde el motor de IA, cuando se transcribe un audio, se lee una imagen de comprobante o se genera una respuesta automática.",
    ],
  },
  {
    id: "usos",
    title: "5. Para qué usamos los datos",
    summary: "Finalidades del tratamiento",
    paragraphs: [
      "Usamos la información solo para prestar y mejorar el servicio de atención. En concreto:",
    ],
    bullets: [
      "Recibir, mostrar y responder tus mensajes del canal de la app.",
      "Identificarte como cliente y consultar tu estado de cuenta, facturas o contrato.",
      "Abrir y dar seguimiento a tickets de soporte u órdenes de trabajo.",
      "Recibir, revisar y conciliar comprobantes de pago, y avisarte si el pago fue aprobado o rechazado.",
      "Asignar conversaciones a asesores humanos o al asistente automático según el horario y las reglas de la organización.",
      "Generar respuestas automáticas, transcribir audios y leer imágenes de recibos cuando la IA está activa.",
      "Conservar el historial de la conversación para que el equipo pueda retomar tu caso.",
      "Enviar notificaciones push opcionales al dispositivo registrado y proteger la plataforma frente a usos no autorizados.",
    ],
  },
  {
    id: "canal-app",
    title: "6. Uso de datos del canal de la app",
    summary: "Canal propio de atención",
    paragraphs: [
      "La aplicación móvil se comunica con endpoints propios de Innover Flow para enviar y recibir mensajes en nombre de la organización. No usamos WhatsApp Cloud API ni Meta como transporte de mensajes.",
      "No usamos los datos del chat para venderlos, cederlos con fines publicitarios a terceros ni para crear perfiles de marketing ajenos al servicio de atención.",
      "Tampoco usamos el contenido de los chats para entrenar modelos de inteligencia artificial de terceros con un fin distinto a responderte o a procesar el comprobante o audio que enviaste.",
    ],
  },
  {
    id: "ia",
    title: "7. Asistente automático e inteligencia artificial",
    summary: "Procesamiento de mensajes con IA",
    paragraphs: [
      "Si la organización tiene el bot activo, el contenido del chat puede enviarse a un proveedor de modelos de lenguaje (actualmente Groq) para:",
    ],
    bullets: [
      "Redactar una respuesta automática de atención o cobranza.",
      "Transcribir un audio que enviaste desde la app.",
      "Leer una imagen o documento, por ejemplo un comprobante de pago.",
    ],
    paragraphsAfter: [
      "Ese procesamiento se hace para completar la atención. El resultado se guarda en el historial del CRM junto con el resto de la conversación.",
    ],
  },
  {
    id: "compartir",
    title: "8. Con quién compartimos la información",
    summary: "Encargados y plataformas",
    paragraphs: [
      "No vendemos datos personales. Solo los compartimos con quienes hacen falta para operar el servicio:",
    ],
    bullets: [
      "Supabase: base de datos, autenticación de asesores y almacenamiento de archivos multimedia.",
      "Wispro: consulta y actualización de contratos, facturación y tickets del proveedor de internet.",
      "API de pagos Innover: registro y validación de pagos reportados por el canal de atención.",
      "Groq: generación de respuestas, transcripción de audio y lectura de imágenes cuando la IA está encendida.",
      "Proveedores de notificaciones push (si la organización habilita avisos al dispositivo).",
      "Asesores y administradores de la organización que te atiende, con acceso limitado según su rol.",
    ],
    paragraphsAfter: [
      "Estos proveedores tratan la información como encargados o plataformas de infraestructura, bajo sus propios términos y medidas de seguridad. Si la ley nos obliga, también podremos entregar datos a autoridades competentes.",
    ],
  },
  {
    id: "conservacion",
    title: "9. Conservación",
    summary: "Cuánto tiempo guardamos los datos",
    paragraphs: [
      "Conservamos las conversaciones, archivos y registros de pago mientras la organización los necesite para atender reclamos, conciliar cobros y cumplir obligaciones operativas o legales.",
      "Los archivos multimedia se guardan en almacenamiento privado asociado a la organización. Si una conversación o un cliente se elimina a petición del titular, borramos o desvinculamos los datos que ya no sean necesarios, salvo que debamos conservarlos por una obligación legal, un pago en disputa o un ticket abierto.",
    ],
  },
  {
    id: "derechos",
    title: "10. Tus derechos y cómo pedir la eliminación",
    summary: "Acceso, corrección y borrado",
    paragraphs: [
      "Puedes solicitar acceso, corrección, actualización o eliminación de tus datos personales. También puedes pedir que dejemos de enviarte mensajes automáticos y que un asesor humano retome tu caso.",
      "Para ejercer estos derechos, escribe por el mismo canal de la app con el que te comunicas e indica claramente que solicitas acceso, corrección o eliminación de tus datos. También puedes contactar al correo de la organización que te atiende, si lo ha publicado.",
      "Cuando recibamos una solicitud de eliminación verificable, eliminaremos o anonimizaremos el historial, los archivos y los datos de cliente asociados que no debamos conservar.",
    ],
  },
  {
    id: "seguridad",
    title: "11. Seguridad",
    summary: "Cómo protegemos la información",
    paragraphs: [
      "Aplicamos medidas técnicas y organizativas razonables para proteger los datos, entre ellas:",
    ],
    bullets: [
      "Comunicación cifrada (HTTPS) entre el CRM, la app y las APIs.",
      "Autenticación de sesión de la app con secretos de canal y tokens firmados.",
      "Cifrado de credenciales de integración (por ejemplo Wispro) en reposo.",
      "Acceso al CRM restringido a asesores autenticados, con roles y organización aislada.",
      "Almacenamiento de multimedia en buckets privados, no públicos.",
    ],
    paragraphsAfter: [
      "Ningún sistema es 100 % invulnerable. Si detectas un incidente que afecte tu información, avísanos por el mismo canal de la app o por el correo de la organización.",
    ],
  },
  {
    id: "menores",
    title: "12. Menores de edad",
    summary: "Uso no dirigido a niños",
    paragraphs: [
      "El canal de atención y el CRM están pensados para clientes y prospectos de un servicio de internet, no para menores de 13 años. No recopilamos de forma consciente datos de niños. Si un padre, madre o tutor considera que un menor nos envió información, puede pedirnos su eliminación por el canal de la app.",
    ],
  },
  {
    id: "transferencias",
    title: "13. Transferencias y ubicación",
    summary: "Dónde se procesan los datos",
    paragraphs: [
      "La atención se presta principalmente en Venezuela. Parte de la infraestructura (Supabase, Groq y otros proveedores de nube) puede procesar o almacenar información en servidores fuera del país. Al usar la app o el CRM, aceptas ese tratamiento en la medida necesaria para prestar el servicio.",
    ],
  },
  {
    id: "cambios",
    title: "14. Cambios a esta política",
    summary: "Actualizaciones",
    paragraphs: [
      `Podemos actualizar esta política cuando cambie el servicio, una integración o la ley aplicable. La fecha de la última versión aparece al inicio de esta página. La versión vigente siempre estará publicada en esta URL pública, sin necesidad de iniciar sesión.`,
    ],
  },
  {
    id: "contacto",
    title: "15. Contacto",
    summary: "Cómo escribirnos",
    paragraphs: [
      `El responsable de esta política es ${PRIVACY_CONTROLLER}, RIF ${PRIVACY_TAX_ID}, operador de ${PRIVACY_PRODUCT}.`,
      "Para preguntas sobre privacidad, acceso a tus datos o eliminación, escribe por el canal de atención de la organización que te atiende e indica que tu mensaje es una solicitud de privacidad. Si eres asesor o administrador, también puedes gestionar estos pedidos desde el CRM.",
    ],
  },
];

export const PRIVACY_HIGHLIGHTS = [
  {
    id: "app",
    label: "App móvil de atención",
  },
  {
    id: "crm",
    label: "CRM de atención",
  },
  {
    id: "wispro",
    label: "Integraciones ISP",
  },
] as const;
