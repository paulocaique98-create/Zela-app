# Secrets e ambientes do GitHub Actions (iOS)

O repositório é público. Nunca colocar valores aqui nem no Git: só os nomes. Criar em Settings, Secrets and variables, Actions.

## Já utilizáveis (workflow `ios-build.yml`, sem conta Apple)
| Secret | O que é | Onde obter |
|---|---|---|
| `HOMOLOG_VITE_SUPABASE_URL` | URL do Supabase de homologação | `.env.mobile.local` local |
| `HOMOLOG_VITE_SUPABASE_ANON_KEY` | chave anon da homologação | `.env.mobile.local` local |

## Só depois da conta Apple (workflow `ios-release.yml`)
| Secret | O que é | Onde obter |
|---|---|---|
| `APPLE_TEAM_ID` | ID da equipe (10 caracteres) | developer.apple.com, Membership |
| `ASC_KEY_ID` | ID da chave da API | App Store Connect, Users and Access, Integrations |
| `ASC_ISSUER_ID` | Issuer ID da API | mesma tela |
| `ASC_KEY_P8_BASE64` | arquivo `AuthKey_XXXX.p8` em base64 (`base64 -w0 AuthKey_XXXX.p8`) | baixado uma única vez ao criar a chave (acesso "App Manager" basta) |
| `GOOGLE_SERVICE_INFO_PLIST_BASE64` | `GoogleService-Info.plist` do app iOS em base64 | Firebase de PRODUÇÃO, app iOS `br.com.zelaedu.app` |
| `PROD_VITE_SUPABASE_URL` | URL do Supabase de produção | painel Supabase |
| `PROD_VITE_SUPABASE_ANON_KEY` | chave anon de produção | painel Supabase |

Assinatura: o workflow usa a assinatura gerenciada pela Apple (chave da API + `-allowProvisioningUpdates`). Não há certificado `.p12` nem provisioning profile para guardar.

## Ambiente com aprovação
Criar o ambiente `ios-release` em Settings, Environments, com "Required reviewers" (você). O `ios-release.yml` só roda depois da sua aprovação.

## Proteções recomendadas (repositório público)
- Proteger a branch `main`.
- Settings, Actions, General: "Require approval for all outside collaborators" nos workflows de PR.
- Os dois workflows de iOS são só `workflow_dispatch`: ninguém de fora os dispara.
- Backup da chave `.p8`, da keystore Android e das senhas em cofre, fora do repositório.

## Fora do GitHub (não esquecer no release)
- Supabase de produção: secret `EXTRA_ALLOWED_ORIGINS` com `https://localhost,capacitor://localhost` (Android e iOS). Na homologação hoje só consta `https://localhost`: para testar o iOS, acrescentar `capacitor://localhost`.
- Firebase: enviar a chave APNs (`.p8`) em Project settings, Cloud Messaging, app iOS.
- Migrations `registrar_token_push_app` e `escola_suspensa` em produção só no release.
