import { Patient } from '../types';
import { parseDate } from '../lib/dateUtils';

/**
 * Serviço para gerenciar dados de pacientes, incluindo integração com APIs externas.
 */
export const patientService = {
  /**
   * Busca dados de um paciente militar do CBMPB e seus dependentes via API.
   * @param identifier Matrícula ou CPF do militar
   */
  async fetchCBMPBPatientData(identifier: string): Promise<{ titular: Partial<Patient>, dependentes: Partial<Patient>[] }> {
    try {
      const response = await fetch(`/api/cbmpb/${identifier}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao buscar dados na API do CBMPB');
      }
      
      const responseData = await response.json();
      console.log('API Response Data:', JSON.stringify(responseData));
      
      // Se a resposta for um objeto vazio, assume que o paciente não foi encontrado
      if (Object.keys(responseData).length === 0) {
        throw new Error('Paciente não encontrado com este identificador.');
      }

      const data = responseData.servidor;
      
      if (!data) throw new Error(`Dados do servidor não encontrados. Resposta: ${JSON.stringify(responseData)}`);
      
      // Mapeamento dos dados do titular
      const titular: Partial<Patient> = {
        name: data.nome,
        email: data.email || '',
        phone: data.telefone ? String(data.telefone) : '',
        cpf: data.cpf,
        birthDate: data.data_nascimento ? data.data_nascimento.split('/').reverse().join('-') : '', // Converte DD/MM/YYYY para YYYY-MM-DD
        address: '', // Não disponível na API
        patientType: 'cbmpb',
        registrationNumber: String(data.matricula),
        functionalCategory: data.categoria_funcional || data.posto_graduacao || data.cargo || data.graduacao || '',
      };

      // Mapeamento dos dependentes
      const dependentes: Partial<Patient>[] = (data.dependente || data.dependentes || []).map((dep: any) => ({
        name: dep.nome,
        email: dep.email || data.email || '',
        phone: dep.telefone || dep.phone || data.telefone || data.phone || '',
        cpf: dep.cpf,
        birthDate: dep.data_nascimento ? dep.data_nascimento.split('/').reverse().join('-') : '', // Converte DD/MM/YYYY para YYYY-MM-DD
        patientType: 'cbmpb',
        dependentOf: String(data.matricula), // Vinculado pela matrícula do titular
      }));

      return { titular, dependentes };
    } catch (error) {
      console.error('Erro na integração CBMPB:', error);
      throw error;
    }
  }
};
