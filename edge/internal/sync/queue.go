package sync

import "sync"

// Queue é uma fila de eventos pendentes de sincronização com a Cloud.
//
// Implementação em memória — o esqueleto ainda não inclui a persistência em
// SQLite (WAL) descrita em docs/edge/edge-service.md; eventos são perdidos se
// o processo cair antes de sincronizar. Trocar por uma implementação
// SQLite-backed é o próximo passo natural desta interface.
type Queue struct {
	mu    sync.Mutex
	itens []Evento
}

func NewQueue() *Queue {
	return &Queue{}
}

// Push enfileira um evento de acesso capturado por um adapter de hardware.
func (q *Queue) Push(e Evento) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.itens = append(q.itens, e)
}

// Len retorna quantos eventos estão pendentes de envio.
func (q *Queue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.itens)
}

// DrainBatch remove e retorna até max eventos da fila, na ordem em que
// chegaram. Os eventos só devem ser considerados enviados após o chamador
// confirmar sucesso na Cloud; em caso de falha, use Requeue para devolvê-los.
func (q *Queue) DrainBatch(max int) []Evento {
	q.mu.Lock()
	defer q.mu.Unlock()
	if max > len(q.itens) {
		max = len(q.itens)
	}
	batch := make([]Evento, max)
	copy(batch, q.itens[:max])
	q.itens = q.itens[max:]
	return batch
}

// Requeue devolve eventos ao início da fila (ex.: após falha no envio).
func (q *Queue) Requeue(eventos []Evento) {
	if len(eventos) == 0 {
		return
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	q.itens = append(eventos, q.itens...)
}
