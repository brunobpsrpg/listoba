# LISTOBA — Cerberus v0.16.1

Kanban inteligente em JSON + PHP com exportação WhatsApp.

## 📦 Estrutura
/listoba/
├── index.html # Interface principal
├── api.php # API de leitura/escrita JSON
├── listoba.json # Banco de dados (tarefas, pessoas, clientes)
├── api.log # Log de API (opcional)
│
├── /css/style.css # Estilos (gradiente, layout e temas)
├── /js/app.js # Lógica (Kanban, filtros, polling, WhatsApp)
└── /assets/ # Logo e favicon


## 🚀 Principais recursos
- Organização modular (HTML / CSS / JS separados)
- Copiar tarefas formatadas para WhatsApp com *bold* e _itálico_
- Modo **Curto** (oculta *Stand-by*) e **Detalhado** (mostra tudo com tags)
- Relatório com até 10 itens visíveis e rolagem
- Salvamento automático em `listoba.json`
- Polling em tempo real a cada 4 segundos

## 🛠️ Permissões no servidor
Para o `api.php` conseguir gravar:
```bash
chmod 666 listoba.json api.log
chmod 644 api.php index.html

💡 Tecnologias

Frontend: HTML5 + Bootstrap 5 + JavaScript puro

Backend: PHP (sem banco de dados, apenas JSON)

Storage: listoba.json

📲 Copiar pro WhatsApp

O botão “Copiar” gera mensagem com:

Negrito e itálico automáticos

Espaçamento duplo entre tarefas

Cabeçalhos (HOJE / AMANHÃ, ESSA SEMANA, etc.)

🧩 Autor

Desenvolvido por Cerberus Studio — Versão v0.16.1
