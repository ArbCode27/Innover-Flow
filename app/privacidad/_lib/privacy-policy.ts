export const PRIVACY_LAST_UPDATED = "23 de septiembre de 2026";
export const PRIVACY_CONTROLLER = "Conexiones Innover";
export const PRIVACY_PRODUCT = "Innover Flow";

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
      `${PRIVACY_CONTROLLER} opera ${PRIVACY_PRODUCT}, un CRM de atención por WhatsApp para gestionar conversaciones, clientes, tickets, cobranza y pagos de servicios de internet.`,
      "Esta política aplica a las personas que escriben al número de WhatsApp Business conectado a la aplicación, a los asesores que usan el CRM y a Meta, que exige una URL pública que explique cómo se usan los datos recibidos a través de WhatsApp Cloud API.",
      `Cuando una organización o sucursal configura su propio número de WhatsApp dentro de la plataforma, esa organización también trata los datos de sus clientes para prestar el servicio. En ese caso, ${PRIVACY_CONTROLLER} actúa como proveedor tecnológico y la organización como responsable del trato cotidiano con sus usuarios.`,
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
      "WhatsApp Business Platform y WhatsApp Cloud API, operadas por Meta Platforms, Inc.",
      "El webhook y los envíos de mensajes de Innover Flow hacia y desde WhatsApp.",
      "El CRM web usado por asesores y administradores para atender chats, tickets y pagos.",
      "Integraciones necesarias para identificar al cliente, consultar facturación y registrar pagos.",
    ],
  },
  {
    id: "datos",
    title: "3. Datos que recopilamos",
    summary: "Información de WhatsApp y del CRM",
    paragraphs: [
      "Recopilamos únicamente la información necesaria para atenderte y operar el servicio. Según cómo te comuniques, podemos tratar:",
    ],
    bullets: [
      "Identificadores de WhatsApp: número de teléfono, identificador de WhatsApp (wa_id) y nombre visible del perfil.",
      "Contenido de los mensajes: texto, plantillas, respuestas rápidas y notas internas del equipo.",
      "Archivos multimedia que envíes o recibas: imágenes, audios, videos, documentos y su nombre de archivo.",
      "Ubicación, solo si decides compartir un mensaje de ubicación por WhatsApp.",
      "Datos de cliente asociados al chat: nombre, cédula u otro identificador, teléfono, estado de cuenta, plan y contrato cuando se vincula con el sistema de gestión (Wispro).",
      "Información de pagos: montos, referencias, capturas o comprobantes de transferencia y el resultado de la revisión.",
      "Datos de tickets y órdenes de trabajo: tipo de reporte, estado, historial de atención y asignación.",
      "Datos de asesores y administradores: nombre, correo, rol, departamento y preferencias de la interfaz.",
      "Datos técnicos del servicio: identificadores de mensaje de Meta, horarios, estado de entrega y registros de error necesarios para operar el webhook.",
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
      "Directamente de ti cuando escribes, llamas, envías un comprobante o compartes un dato por WhatsApp.",
      "Desde Meta / WhatsApp Cloud API, cuando el webhook recibe mensajes, estados de entrega o ecos de la app móvil de WhatsApp Business.",
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
      "Recibir, mostrar y responder tus mensajes de WhatsApp.",
      "Identificarte como cliente y consultar tu estado de cuenta, facturas o contrato.",
      "Abrir y dar seguimiento a tickets de soporte u órdenes de trabajo.",
      "Recibir, revisar y conciliar comprobantes de pago, y avisarte si el pago fue aprobado o rechazado.",
      "Asignar conversaciones a asesores humanos o al asistente automático según el horario y las reglas de la organización.",
      "Generar respuestas automáticas, transcribir audios y leer imágenes de recibos cuando la IA está activa.",
      "Conservar el historial de la conversación para que el equipo pueda retomar tu caso.",
      "Proteger la plataforma: validar la firma de Meta, evitar usos no autorizados y diagnosticar fallos.",
    ],
  },
  {
    id: "whatsapp-meta",
    title: "6. Uso de datos de WhatsApp y Meta",
    summary: "Requisitos de la Cloud API",
    paragraphs: [
      "La aplicación se conecta a WhatsApp Cloud API de Meta para enviar y recibir mensajes en nombre de la organización. Meta nos entrega el contenido del mensaje, el número de origen y metadatos técnicos. Nosotros devolvemos respuestas, confirmaciones y, cuando corresponde, plantillas o archivos.",
      "No usamos los datos obtenidos a través de WhatsApp para venderlos, cederlos con fines publicitarios a terceros ni para crear perfiles de marketing ajenos al servicio de atención.",
      "Tampoco usamos el contenido de los chats de WhatsApp para entrenar modelos de inteligencia artificial de terceros con un fin distinto a responderte o a procesar el comprobante o audio que enviaste.",
      "El uso de WhatsApp sigue las políticas de WhatsApp Business y los términos de la plataforma de Meta. Meta trata esos datos según su propia política de privacidad.",
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
      "Transcribir un audio que enviaste por WhatsApp.",
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
      "Meta Platforms / WhatsApp: transporte, entrega y recepción de mensajes.",
      "Supabase: base de datos, autenticación de asesores y almacenamiento de archivos multimedia.",
      "Wispro: consulta y actualización de contratos, facturación y tickets del proveedor de internet.",
      "API de pagos Innover: registro y validación de pagos reportados por WhatsApp.",
      "Groq: generación de respuestas, transcripción de audio y lectura de imágenes cuando la IA está encendida.",
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
      "Los archivos multimedia de WhatsApp se guardan en almacenamiento privado asociado a la organización. Si una conversación o un cliente se elimina a petición del titular, borramos o desvinculamos los datos que ya no sean necesarios, salvo que debamos conservarlos por una obligación legal, un pago en disputa o un ticket abierto.",
    ],
  },
  {
    id: "derechos",
    title: "10. Tus derechos y cómo pedir la eliminación",
    summary: "Acceso, corrección y borrado",
    paragraphs: [
      "Puedes solicitar acceso, corrección, actualización o eliminación de tus datos personales. También puedes pedir que dejemos de enviarte mensajes automáticos y que un asesor humano retome tu caso.",
      "Para ejercer estos derechos, escribe al mismo número de WhatsApp Business con el que te comunicas e indica claramente que solicitas acceso, corrección o eliminación de tus datos. También puedes contactar al correo de la organización que te atiende, si lo ha publicado.",
      "Cuando recibamos una solicitud de eliminación verificable, eliminaremos o anonimizaremos el historial, los archivos y los datos de cliente asociados que no debamos conservar. Meta podrá conservar copias según sus propias políticas de la plataforma.",
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
      "Comunicación cifrada (HTTPS) entre el CRM, las APIs y WhatsApp.",
      "Validación de la firma de Meta en el webhook para aceptar solo eventos auténticos.",
      "Cifrado de credenciales de integración (WhatsApp y Wispro) en reposo.",
      "Acceso al CRM restringido a asesores autenticados, con roles y organización aislada.",
      "Almacenamiento de multimedia en buckets privados, no públicos.",
    ],
    paragraphsAfter: [
      "Ningún sistema es 100 % invulnerable. Si detectas un incidente que afecte tu información, avísanos por el mismo canal de WhatsApp o por el correo de la organización.",
    ],
  },
  {
    id: "menores",
    title: "12. Menores de edad",
    summary: "Uso no dirigido a niños",
    paragraphs: [
      "El servicio de WhatsApp Business y el CRM están pensados para clientes y prospectos de un servicio de internet, no para menores de 13 años. No recopilamos de forma consciente datos de niños. Si un padre, madre o tutor considera que un menor nos envió información, puede pedirnos su eliminación por WhatsApp.",
    ],
  },
  {
    id: "transferencias",
    title: "13. Transferencias y ubicación",
    summary: "Dónde se procesan los datos",
    paragraphs: [
      "La atención se presta principalmente en Venezuela. Parte de la infraestructura (Meta/WhatsApp, Supabase, Groq y otros proveedores de nube) puede procesar o almacenar información en servidores fuera del país. Al escribirnos por WhatsApp o usar el CRM, aceptas ese tratamiento en la medida necesaria para prestar el servicio.",
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
      `El responsable de esta política es ${PRIVACY_CONTROLLER}, operador de ${PRIVACY_PRODUCT}.`,
      "Para preguntas sobre privacidad, acceso a tus datos o eliminación, escribe al número de WhatsApp Business de la organización que te atiende e indica que tu mensaje es una solicitud de privacidad. Si eres asesor o administrador, también puedes gestionar estos pedidos desde el CRM.",
    ],
  },
];

export const PRIVACY_HIGHLIGHTS = [
  {
    id: "whatsapp",
    label: "WhatsApp Cloud API",
  },
  {
    id: "meta",
    label: "Meta Business",
  },
  {
    id: "crm",
    label: "CRM de atención",
  },
] as const;
