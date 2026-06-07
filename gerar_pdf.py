from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

OUTPUT = r"C:\Users\davic\Documents\GitHub\Uniube\Respostas_Artigo_FitAI.pdf"

INDIGO   = colors.HexColor("#4f46e5")
INDIGO_L = colors.HexColor("#ede9fe")
YELLOW_L = colors.HexColor("#fef3c7")
AMBER    = colors.HexColor("#f59e0b")
GRAY_L   = colors.HexColor("#f5f5ff")
GRAY_BD  = colors.HexColor("#c7d2fe")
WHITE    = colors.white
DARK     = colors.HexColor("#1a1a2e")
MUTED    = colors.HexColor("#6b7280")

doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=2.2*cm, rightMargin=2.2*cm,
    topMargin=2.0*cm,  bottomMargin=2.0*cm,
    title="Respostas Técnicas – Artigo FitAI"
)
W = A4[0] - 4.4*cm

base = getSampleStyleSheet()

def S(name, parent="Normal", **kw):
    return ParagraphStyle(name, parent=base[parent], **kw)

ST = {
    "capa_uni":    S("cu", fontSize=9,  textColor=MUTED,  alignment=TA_CENTER, spaceAfter=4),
    "capa_titulo": S("ct", fontSize=16, textColor=DARK,   alignment=TA_CENTER, spaceAfter=8,
                     fontName="Helvetica-Bold", leading=20),
    "capa_sub":    S("cs", fontSize=11, textColor=INDIGO, alignment=TA_CENTER, spaceAfter=10, leading=16),
    "capa_autor":  S("ca", fontSize=9,  textColor=DARK,   alignment=TA_CENTER, spaceAfter=3, leading=14),
    "secao":       S("se", fontSize=13, textColor=INDIGO, fontName="Helvetica-Bold",
                     spaceBefore=16, spaceAfter=8),
    "sub":         S("su", fontSize=10, textColor=DARK,   fontName="Helvetica-Bold",
                     spaceBefore=10, spaceAfter=4),
    "body":        S("bo", fontSize=9.5, textColor=DARK,  leading=14, spaceAfter=4,
                     alignment=TA_JUSTIFY),
    "note":        S("no", fontSize=9,  textColor=colors.HexColor("#92400e"), leading=13),
    "info":        S("in", fontSize=9,  textColor=colors.HexColor("#3730a3"), leading=13),
    "th":          S("th", fontSize=9,  textColor=WHITE,  fontName="Helvetica-Bold", leading=12),
    "td":          S("td", fontSize=9,  textColor=DARK,   leading=13),
    "tdl":         S("tl", fontSize=9,  textColor=INDIGO, fontName="Helvetica-Bold", leading=13),
    "foot":        S("fo", fontSize=8,  textColor=MUTED,  alignment=TA_CENTER),
}

def note_box(text, color=YELLOW_L, border=AMBER, ts="note"):
    t = Table([[Paragraph(text, ST[ts])]], colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), color),
        ("LEFTPADDING",  (0,0),(-1,-1), 10),
        ("RIGHTPADDING", (0,0),(-1,-1), 10),
        ("TOPPADDING",   (0,0),(-1,-1), 7),
        ("BOTTOMPADDING",(0,0),(-1,-1), 7),
        ("LINEBEFORE",   (0,0),(0,-1),  3, border),
        ("BOX",          (0,0),(-1,-1), 0.5, border),
    ]))
    return t

def section_title(txt):
    return [
        HRFlowable(width=W, thickness=0.5, color=GRAY_BD, spaceAfter=2),
        Paragraph(txt, ST["secao"]),
    ]

def two_col(rows, c1pct=0.37):
    c1, c2 = W*c1pct, W*(1-c1pct)
    data = []
    for lbl, val in rows:
        l = Paragraph(lbl, ST["tdl"])
        v = Paragraph(val, ST["td"]) if isinstance(val, str) else val
        data.append([l, v])
    t = Table(data, colWidths=[c1, c2])
    cmds = [
        ("VALIGN",       (0,0),(-1,-1),"TOP"),
        ("LEFTPADDING",  (0,0),(-1,-1), 8),
        ("RIGHTPADDING", (0,0),(-1,-1), 8),
        ("TOPPADDING",   (0,0),(-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("GRID",         (0,0),(-1,-1), 0.4, colors.HexColor("#e5e7eb")),
    ]
    for i in range(0, len(data), 2):
        cmds.append(("BACKGROUND",(0,i),(-1,i), GRAY_L))
    t.setStyle(TableStyle(cmds))
    return t

def full_table(headers, rows, cws=None):
    if cws is None:
        cws = [W/len(headers)]*len(headers)
    data = [[Paragraph(h, ST["th"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), ST["td"]) for c in row])
    t = Table(data, colWidths=cws)
    cmds = [
        ("BACKGROUND",   (0,0),(-1,0),  INDIGO),
        ("VALIGN",       (0,0),(-1,-1),"TOP"),
        ("LEFTPADDING",  (0,0),(-1,-1), 7),
        ("RIGHTPADDING", (0,0),(-1,-1), 7),
        ("TOPPADDING",   (0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("GRID",         (0,0),(-1,-1), 0.4, colors.HexColor("#e5e7eb")),
    ]
    for i in range(1, len(data), 2):
        cmds.append(("BACKGROUND",(0,i),(-1,i), GRAY_L))
    t.setStyle(TableStyle(cmds))
    return t

# ══════════════════════════════════════════════════════════════════════
story = []

# ── CAPA ──────────────────────────────────────────────────────────────
story += [
    Spacer(1, 1.5*cm),
    Paragraph("UNIVERSIDADE DE UBERABA – UNIUBE · CAMPUS UBERLÂNDIA", ST["capa_uni"]),
    Paragraph("BACHARELADO EM SISTEMAS DE INFORMAÇÃO · PROJETOS INTEGRADOS I", ST["capa_uni"]),
    Spacer(1, 1*cm),
    HRFlowable(width=W, thickness=2, color=INDIGO, spaceAfter=14),
    Paragraph("Respostas Técnicas para o Artigo Científico", ST["capa_titulo"]),
    Spacer(1, 0.2*cm),
    Paragraph(
        "Aplicação de Redes Neurais Convolucionais 3D no Reconhecimento de Ações Humanas em Vídeo:<br/>"
        "Uma Proposta para Gamificação de Academias",
        ST["capa_sub"]
    ),
    HRFlowable(width=W, thickness=1, color=GRAY_BD, spaceAfter=14),
    Spacer(1, 0.5*cm),
    Paragraph("Cassio Figueira Santos", ST["capa_autor"]),
    Paragraph("Davi Castro Jorge da Costa", ST["capa_autor"]),
    Paragraph("Jessica Rodrigues Martins", ST["capa_autor"]),
    Paragraph("Larissa Miuki Kitayama", ST["capa_autor"]),
    Paragraph("Paulo Gabriel Fernandes Ribeiro", ST["capa_autor"]),
    Paragraph("Rafael Alvarenga Pereira Palomino", ST["capa_autor"]),
    Spacer(1, 0.8*cm),
    Paragraph("Orientador: Prof. Marcus Artiaga Colantoni", ST["capa_uni"]),
    Paragraph("Uberlândia · 2026", ST["capa_uni"]),
    HRFlowable(width=W, thickness=2, color=INDIGO, spaceBefore=20),
    PageBreak(),
]

# ── NOTA GERAL ────────────────────────────────────────────────────────
story.append(note_box(
    "<b>Importante:</b> Este trabalho é caracterizado no projeto de pesquisa como uma "
    "<b>investigação teórica com proposta conceitual</b> (Design Science Research). "
    "O protótipo implementado usa <b>MediaPipe Pose + classificador baseado em regras angulares em JavaScript</b>, "
    "não uma CNN 3D treinada. As seções abaixo descrevem com precisão o que foi e o que não foi realizado.",
    color=INDIGO_L, border=INDIGO, ts="info"
))
story.append(Spacer(1, 0.3*cm))

# ══════════════════════════════════════════════════════════════════════
# 1. DATASET
# ══════════════════════════════════════════════════════════════════════
story += section_title("1. Qual dataset foi usado?")
story.append(note_box(
    "<b>Situação real:</b> Nenhum dataset de vídeos foi coletado ou utilizado para treinamento. "
    "O protótipo opera exclusivamente com a câmera em tempo real. A classificação é feita por "
    "regras angulares hardcoded no código — não há aprendizado de máquina supervisionado."
))
story.append(Spacer(1, 0.15*cm))
story.append(two_col([
    ("Nome do dataset",
     "Não se aplica. Nenhum dataset foi coletado. O protótipo utiliza o feed da câmera em tempo real "
     "como entrada direta, sem etapa de treinamento sobre vídeos pré-gravados."),
    ("Link / origem",
     "Não se aplica. O modelo de detecção de pose utilizado é o <b>MediaPipe Pose</b>, "
     "carregado via CDN: cdn.jsdelivr.net/npm/@mediapipe/pose "
     "(conforme pose.js, linha 58 do código-fonte)."),
    ("Quantidade total de vídeos",
     "Nenhum vídeo foi coletado. Não aplicável."),
    ("Quantidade de classes",
     "<b>5 classes</b>, definidas diretamente no código-fonte (classifier.js, linha 8)."),
    ("Nome das classes / exercícios",
     "Conforme classifier.js linha 8:<br/>"
     "1. Agachamento &nbsp; 2. Polichinelo &nbsp; 3. Flexão &nbsp; 4. Avanço &nbsp; 5. Joelho Alto"),
    ("Quantidade de vídeos por classe",
     "Não se aplica — não há dataset de vídeos."),
    ("Tipo do dataset",
     "Não aplicável. Não foi usado dataset. A proposta teórica do artigo descreve o uso futuro "
     "de datasets públicos de reconhecimento de ações humanas para treinar uma CNN 3D."),
    ("Divisão treino / validação / teste",
     "Não se aplica. Não há treinamento ML. A classificação é baseada em limiares angulares "
     "definidos manualmente no código."),
]))

# ══════════════════════════════════════════════════════════════════════
# 2. PRÉ-PROCESSAMENTO
# ══════════════════════════════════════════════════════════════════════
story += section_title("2. Como os vídeos foram pré-processados?")
story.append(two_col([
    ("Frames por vídeo",
     "O sistema não processa vídeos gravados. Opera em tempo real, frame a frame, "
     "via câmera web. Um <b>buffer de 5 frames consecutivos</b> é mantido para "
     "estabilizar a detecção de exercício antes de confirmar uma troca "
     "(classifier.js, linha 45: _bufferSize = 5)."),
    ("Resolução dos frames",
     "<b>640 × 480 pixels</b> — configurado em pose.js, linhas 103-104: "
     "width: 640, height: 480."),
    ("Redimensionamento",
     "O MediaPipe Pose realiza redimensionamento interno dos frames antes da inferência. "
     "Não há redimensionamento manual no código do protótipo."),
    ("Normalização dos pixels",
     "O MediaPipe normaliza automaticamente as coordenadas dos landmarks para o "
     "intervalo <b>[0, 1]</b> relativo às dimensões do frame. "
     "Não há normalização adicional implementada no código."),
    ("Extração / amostragem de frames",
     "Todos os frames são processados em tempo real, sem subamostragem. "
     "O MediaPipe Camera envia cada frame capturado para o modelo "
     "(pose.js, função start(), linha 93-99)."),
    ("Formato final da entrada da rede",
     "Frame RGB (640×480) → MediaPipe Pose → <b>33 landmarks 3D</b> com "
     "coordenadas normalizadas (x, y, z) e score de visibilidade → "
     "cálculo de <b>11 ângulos articulares</b>: leftKnee, rightKnee, leftHip, "
     "rightHip, leftElbow, rightElbow, leftShoulder, rightShoulder, "
     "trunkAngle, leftAnkle, rightAnkle (pose.js, função getKeyAngles, linhas 257-276)."),
]))

# ══════════════════════════════════════════════════════════════════════
# 3. ARQUITETURA
# ══════════════════════════════════════════════════════════════════════
story += section_title("3. Qual arquitetura de IA foi usada?")
story.append(note_box(
    "<b>Distinção importante:</b> O artigo propõe teoricamente o uso de CNN 3D. "
    "O protótipo implementado utiliza MediaPipe Pose (modelo pré-treinado do Google) "
    "combinado com um classificador baseado em regras angulares — "
    "<b>não é uma CNN 3D treinada pela equipe</b>.",
    color=INDIGO_L, border=INDIGO, ts="info"
))
story.append(Spacer(1, 0.15*cm))
story.append(Paragraph("Arquitetura implementada no protótipo", ST["sub"]))
story.append(two_col([
    ("Tipo",
     "<b>MediaPipe Pose (BlazePose) + Classificador baseado em regras angulares</b>. "
     "Abordagem híbrida: modelo pré-treinado para detecção de pose + lógica simbólica "
     "para classificação de exercícios."),
    ("Modelo de detecção de pose",
     "MediaPipe Pose, carregado via CDN (cdn.jsdelivr.net/npm/@mediapipe/pose). "
     "Configurações usadas (pose.js, linhas 62-66):<br/>"
     "modelComplexity: 1<br/>"
     "smoothLandmarks: true<br/>"
     "enableSegmentation: false<br/>"
     "minDetectionConfidence: 0.5<br/>"
     "minTrackingConfidence: 0.5"),
    ("Landmarks extraídos",
     "33 landmarks corporais por frame, com coordenadas normalizadas (x, y, z) "
     "e score de visibilidade — padrão do MediaPipe Pose."),
    ("Classificador de exercícios",
     "Baseado em regras angulares — não possui camadas treináveis. "
     "Componentes (classifier.js):<br/>"
     "• Cálculo de 11 ângulos articulares (pose.js, getKeyAngles)<br/>"
     "• Máquina de estados por exercício (up/down, open/closed etc.)<br/>"
     "• Buffer de estabilidade: 5 frames consecutivos<br/>"
     "• Sistema de pontuação por repetição e qualidade"),
    ("Camadas / estrutura",
     "Não aplicável ao classificador (baseado em regras, sem camadas neurais). "
     "O MediaPipe Pose possui arquitetura interna própria do Google, "
     "não configurável pelo protótipo."),
    ("Função de ativação",
     "Não aplicável ao classificador do protótipo (limiares angulares, sem neurônios)."),
    ("Função de saída",
     "Exercício detectado dentre 5 classes, contagem de repetições, "
     "score de qualidade (0 a 1) e pontuação gamificada."),
    ("Número de parâmetros treináveis",
     "Zero — o classificador é baseado em regras. O MediaPipe Pose é um modelo "
     "pré-treinado pelo Google, cujos parâmetros não são modificados."),
]))

story.append(Spacer(1, 0.2*cm))
story.append(Paragraph(
    "Arquitetura proposta no artigo (não implementada nesta fase — trabalho futuro)",
    ST["sub"]
))
story.append(two_col([
    ("Tipo proposto",
     "CNN 3D para reconhecimento de ações em vídeo, conforme discutido na revisão "
     "da literatura do projeto de pesquisa (Yang et al., 2024 — arquitetura STA-C3DL; "
     "Bang e Park, 2024)."),
    ("Referência teórica",
     "YANG, Fan et al. Action recognition in rehabilitation: combining 3D convolution "
     "and LSTM with spatiotemporal attention. <i>Frontiers in Physiology</i>, v. 15, "
     "p. 1472380, 2024."),
    ("Status",
     "Proposta conceitual — não implementada. A implementação de CNN 3D é identificada "
     "no cronograma do projeto como etapa futura (fase Protótipo: 13/05 a 31/05/2026)."),
]))

# ══════════════════════════════════════════════════════════════════════
# 4. TREINAMENTO
# ══════════════════════════════════════════════════════════════════════
story += section_title("4. Como foi feito o treinamento?")
story.append(note_box(
    "<b>Não houve treinamento de modelo de machine learning.</b> "
    "O protótipo utiliza o MediaPipe Pose (pré-treinado pelo Google) para detecção de pose "
    "e um classificador baseado em regras angulares escritas manualmente em JavaScript. "
    "Não há etapa de treinamento, otimizador, função de perda ou épocas."
))
story.append(Spacer(1, 0.15*cm))
story.append(two_col([
    ("Linguagem",
     "<b>JavaScript</b> (ES6+) — aplicação web client-side, sem backend de processamento."),
    ("Bibliotecas / frameworks",
     "Conforme os arquivos do projeto:<br/>"
     "• <b>@mediapipe/pose</b> — detecção de landmarks corporais (pose.js)<br/>"
     "• <b>@mediapipe/camera_utils</b> — acesso e controle da câmera (pose.js)<br/>"
     "• <b>Firebase Firestore</b> — persistência de treinos e exercícios (config.js, app.js)<br/>"
     "• <b>Firebase Auth</b> — autenticação do usuário (config.js)<br/>"
     "• HTML5 Canvas API — renderização do esqueleto em tempo real (pose.js)"),
    ("Número de épocas",
     "Não se aplica — não houve treinamento de modelo."),
    ("Taxa de aprendizado",
     "Não se aplica — não houve treinamento de modelo."),
    ("Otimizador",
     "Não se aplica — não houve treinamento de modelo."),
    ("Função de perda",
     "Não se aplica — não houve treinamento de modelo."),
    ("Tempo de treinamento",
     "Não se aplica — não houve treinamento de modelo."),
    ("Ambiente / máquina",
     "Desenvolvimento em máquina local com VSCode e navegador Chrome. "
     "A aplicação roda inteiramente no navegador do usuário (client-side), "
     "sem servidor de processamento."),
]))

# ══════════════════════════════════════════════════════════════════════
# 5. RESULTADOS
# ══════════════════════════════════════════════════════════════════════
story += section_title("5. Quais foram os resultados?")
story.append(note_box(
    "<b>Situação real:</b> Nenhuma métrica formal foi computada (acurácia, precisão, recall, "
    "F1-score, matriz de confusão). Como o sistema é baseado em regras e não houve "
    "treinamento ML, não existem curvas de loss/accuracy. "
    "O artigo obtém métricas de forma indireta, pela análise comparativa dos estudos citados "
    "(conforme seção 6.1 da Metodologia do projeto de pesquisa)."
))
story.append(Spacer(1, 0.15*cm))
story.append(two_col([
    ("Acurácia no treino",
     "Não se aplica — não houve treinamento de modelo."),
    ("Acurácia na validação",
     "Não mensurada formalmente. O sistema foi testado manualmente pelos autores "
     "para verificar o funcionamento da detecção de cada exercício."),
    ("Acurácia no teste",
     "Não mensurada formalmente."),
    ("Precisão",
     "Não mensurada formalmente."),
    ("Recall / Revocação",
     "Não mensurado formalmente."),
    ("F1-score",
     "Não mensurado formalmente. O projeto de pesquisa utiliza F1-score de forma "
     "<b>indireta</b>, comparando resultados reportados nos artigos citados "
     "(ex.: Yang et al., 2024; Bang e Park, 2024) — não do protótipo próprio."),
    ("Matriz de confusão",
     "Não gerada — não houve avaliação formal com dataset rotulado."),
    ("Gráficos de loss e accuracy",
     "Não existem — não houve treinamento por gradiente descendente."),
    ("Classes com melhor desempenho",
     "Com base nos testes manuais realizados pelos autores: o <b>Agachamento</b> e o "
     "<b>Polichinelo</b> apresentaram detecção mais consistente, por serem movimentos "
     "bilaterais com padrões angulares bem definidos."),
    ("Classes com maior dificuldade",
     "Com base nos testes manuais: <b>Avanço</b> e <b>Joelho Alto</b> apresentaram "
     "maior dificuldade, pois ambos envolvem levantamento unilateral de perna, "
     "gerando confusão nas regras de detecção (classifier.js, linhas 231-247)."),
]))

story.append(Spacer(1, 0.15*cm))
story.append(Paragraph("O que foi validado no protótipo", ST["sub"]))
story.append(full_table(
    ["Funcionalidade", "Status verificado"],
    [
        ("Detecção de Agachamento em tempo real",     "Funcionando — máquina de estados up/down (classifier.js, linha 288)"),
        ("Detecção de Polichinelo em tempo real",     "Funcionando — estado open/closed por posição de braços e pés (linha 382)"),
        ("Detecção de Flexão em tempo real",          "Funcionando — detecta posição horizontal + flexão de cotovelo (linha 414)"),
        ("Detecção de Avanço em tempo real",          "Funcionando — diferença angular entre joelhos (linha 483)"),
        ("Detecção de Joelho Alto em tempo real",     "Funcionando — joelho acima do quadril (linha 528)"),
        ("Contagem de repetições",                    "Funcionando para todas as 5 classes"),
        ("Score de qualidade por repetição (0–1)",    "Funcionando — verifica profundidade, alinhamento, simetria"),
        ("Sistema de pontuação gamificada",           "Funcionando — pontos base + bônus de qualidade por exercício"),
        ("Feedback textual em tempo real",            "Funcionando — mensagens de correção e confirmação"),
        ("Persistência de treinos (Firebase)",        "Implementado em app.js via Firestore"),
        ("Registro de exercício personalizado",       "Implementado — captura de template angular via câmera"),
    ],
    cws=[W*0.42, W*0.58]
))

# ══════════════════════════════════════════════════════════════════════
# 6. DIFICULDADES E LIMITAÇÕES
# ══════════════════════════════════════════════════════════════════════
story += section_title("6. Quais foram as dificuldades e limitações?")
story.append(full_table(
    ["Limitação", "Descrição"],
    [
        ("Ausência de dataset e métricas formais",
         "Por ser uma pesquisa teórica com protótipo conceitual, não foi coletado dataset "
         "nem mensuradas métricas de ML. Não é possível afirmar acurácia com precisão científica."),
        ("Classificador baseado em regras (não ML)",
         "O classificador usa limiares angulares fixos (hardcoded), o que limita a generalização "
         "para diferentes biotipos, velocidades de execução e alturas de câmera."),
        ("Variação de ângulo de câmera",
         "A detecção é otimizada para câmera frontal. A Flexão (push-up) é mais precisa com "
         "câmera lateral — conflito com o posicionamento padrão do protótipo."),
        ("Dependência de iluminação",
         "O MediaPipe Pose reduz a confiança dos landmarks em ambientes com pouca luz ou "
         "contraluz, impactando diretamente a classificação."),
        ("Confusão entre Avanço e Joelho Alto",
         "Ambos os exercícios envolvem levantamento unilateral de perna, gerando sobreposição "
         "nos critérios angulares. Identificado nos testes manuais dos autores."),
        ("Limitação biomecânica",
         "O sistema avalia ângulos 2D (projeção da câmera). Erros tridimensionais como "
         "rotação de quadril e pronação de pé não são detectados."),
        ("Custo computacional no navegador",
         "O processamento frame a frame do MediaPipe em JavaScript pode ser lento em "
         "dispositivos de baixo desempenho, especialmente mobile."),
        ("CNN 3D não implementada",
         "A arquitetura proposta no artigo (CNN 3D) não foi implementada nesta fase. "
         "O sistema conceitual completo está previsto como trabalho futuro."),
    ],
    cws=[W*0.32, W*0.68]
))

# ══════════════════════════════════════════════════════════════════════
# 7. O QUE FALTA FAZER
# ══════════════════════════════════════════════════════════════════════
story += section_title("7. O que ainda falta fazer?")
story.append(full_table(
    ["Ponto", "Descrição"],
    [
        ("Coletar dataset formal de vídeos",
         "Gravar vídeos com diferentes usuários, biotipos, ângulos de câmera e condições "
         "de iluminação para possibilitar treinamento e avaliação de um modelo de CNN 3D."),
        ("Implementar e treinar CNN 3D",
         "Substituir o classificador de regras por uma CNN 3D treinada, conforme proposto "
         "no artigo. Referência: Yang et al. (2024) — STA-C3DL (3D CNN + LSTM + atenção "
         "espaço-temporal); Bang e Park (2024) — CNN em ensemble para exercícios."),
        ("Mensurar métricas formais",
         "Após treinar o modelo, calcular acurácia, precisão, recall, F1-score e "
         "gerar matriz de confusão com dataset de teste separado."),
        ("Melhorar interface gamificada",
         "Aprimorar o sistema de pontuação com ranking, conquistas, missões diárias "
         "e dashboard de evolução do usuário ao longo dos treinos."),
        ("Validar com usuários reais",
         "Realizar testes de usabilidade e eficácia com praticantes de academia reais, "
         "não apenas com os autores do projeto."),
        ("Validar com profissional de Ed. Física",
         "Submeter o sistema e os feedbacks gerados à avaliação de um especialista em "
         "biomecânica e treinamento físico para atestar correção técnica."),
        ("Otimizar para dispositivos móveis",
         "Testar e otimizar o desempenho para smartphones, que são o principal dispositivo "
         "de acesso em contexto de academia."),
        ("Expandir número de exercícios",
         "O código já suporta exercícios personalizados via gravação de template angular "
         "(ExerciseRecorder — classifier.js, linha 678). Ampliar o conjunto de exercícios "
         "nativos reconhecidos pelo sistema."),
    ],
    cws=[W*0.32, W*0.68]
))

# ── RODAPÉ ────────────────────────────────────────────────────────────
story += [
    Spacer(1, 0.6*cm),
    HRFlowable(width=W, thickness=0.5, color=GRAY_BD),
    Spacer(1, 0.2*cm),
    Paragraph(
        "Documento elaborado com base exclusivamente no código-fonte do protótipo FitAI "
        "(pose.js, classifier.js, app.js, config.js) e nos PDFs do projeto de pesquisa. "
        "Nenhum dado foi inventado ou estimado. "
        "UNIUBE · Projetos Integrados I · 2026 · Orientador: Prof. Marcus Artiaga Colantoni",
        ST["foot"]
    ),
]

doc.build(story)
print(f"PDF gerado: {OUTPUT}")
