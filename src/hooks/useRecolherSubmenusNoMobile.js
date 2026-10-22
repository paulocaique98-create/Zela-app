import { useEffect } from 'react';

// No celular, ao fechar o menu (tocou num item ou fora dele), os submenus
// voltam recolhidos: na próxima abertura ninguém vê "Acadêmico" expandido.
// No desktop o menu lateral é fixo e o grupo aberto continua como está.
export function useRecolherSubmenusNoMobile(isMobileMenuOpen, isDesktop, setOpenAccordion) {
  useEffect(() => {
    if (!isMobileMenuOpen && !isDesktop) setOpenAccordion(null);
  }, [isMobileMenuOpen, isDesktop, setOpenAccordion]);
}
