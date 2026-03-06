import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandler } from '../src/messaging/MessageHandler';
import { PostgresIncidentRepository } from '../src/repositories/PostgresIncidentRepository';
import { determinePriority, determineStatus } from '../src/processor';
import { IncidentType, Priority, IncidentStatus } from '../src/types';
import pool from '../src/utils/database';
import { Channel, ConsumeMessage } from 'amqplib';
import { metrics } from '../src/utils/metrics';

// Mock database pool
vi.mock('../src/utils/database', () => ({
    default: { query: vi.fn() },
    initializeDatabase: vi.fn(),
}));

// Mock logger
vi.mock('../src/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock metrics
vi.mock('../src/utils/metrics', () => ({
    metrics: {
        incrementProcessed: vi.fn(),
        incrementRejected: vi.fn(),
        incrementRetried: vi.fn(),
    },
}));

describe('Consumer — Unit Tests (Expanded for Coverage)', () => {

    describe('Processor Logic — determinePriority & determineStatus', () => {
        it('Given a NO_SERVICE incident, When determining priority, Then it should return HIGH', () => {
            expect(determinePriority(IncidentType.NO_SERVICE)).toBe(Priority.HIGH);
        });

        it('Given HIGH priority, When determining status, Then it should return IN_PROGRESS', () => {
            expect(determineStatus(Priority.HIGH)).toBe(IncidentStatus.IN_PROGRESS);
        });

        it('Given PENDING priority, When determining status, Then it should return RECEIVED', () => {
            expect(determineStatus(Priority.PENDING)).toBe(IncidentStatus.RECEIVED);
        });
    });

    describe('PostgresIncidentRepository — Persistence', () => {
        let repository: PostgresIncidentRepository;

        beforeEach(() => {
            repository = new PostgresIncidentRepository();
            vi.clearAllMocks();
        });

        it('Given a valid incident, When saving to repository, Then it should call pool.query with correct parameters', async () => {
            // Given
            const incident = {
                ticketId: 'test-uuid',
                lineNumber: '099123456',
                email: 'test@example.com',
                type: IncidentType.NO_SERVICE,
                description: 'Test',
                priority: Priority.HIGH,
                status: IncidentStatus.IN_PROGRESS,
                createdAt: new Date().toISOString(),
                processedAt: new Date(),
            };

            (pool.query as any).mockResolvedValue({ rows: [incident] });

            // When
            await repository.save(incident);

            // Then
            expect(pool.query).toHaveBeenCalled();
            const lastCall = vi.mocked(pool.query).mock.calls[0];
            expect(lastCall[1]).toContain(incident.ticketId);
            expect(lastCall[1]).toContain(incident.lineNumber);
        });
    });

    describe('MessageHandler — Message Processing', () => {
        let mockChannel: Partial<Channel>;
        let mockRepository: Partial<PostgresIncidentRepository>;
        let handler: MessageHandler;

        beforeEach(() => {
            mockChannel = {
                ack: vi.fn(),
                nack: vi.fn(),
            };
            mockRepository = {
                save: vi.fn().mockResolvedValue({}),
            };
            handler = new MessageHandler(mockChannel as Channel, mockRepository as any);
            vi.clearAllMocks();
        });

        it('Given a valid message, When handled, Then it should persist incident and ack message', async () => {
            // Given
            const messageContent = {
                ticketId: 'msg-123',
                lineNumber: '099000111',
                email: 'user@test.com',
                type: IncidentType.NO_SERVICE,
                createdAt: new Date().toISOString(),
            };
            const amqpMsg = {
                content: Buffer.from(JSON.stringify(messageContent)),
                properties: { headers: {}, correlationId: 'corr-1' },
            } as unknown as ConsumeMessage;

            // When
            await handler.handle(amqpMsg);

            // Then
            expect(mockRepository.save).toHaveBeenCalled();
            expect(mockChannel.ack!).toHaveBeenCalledWith(amqpMsg);
        });

        it('Given an invalid message type, When handled, Then it should nack message without requeue', async () => {
            // Given
            const messageContent = {
                ticketId: 'msg-123',
                type: 'INVALID_TYPE',
            };
            const amqpMsg = {
                content: Buffer.from(JSON.stringify(messageContent)),
                properties: { headers: {}, correlationId: 'corr-1' },
            } as unknown as ConsumeMessage;

            // When
            await handler.handle(amqpMsg);

            // Then
            expect(mockRepository.save).not.toHaveBeenCalled();
            expect(mockChannel.nack!).toHaveBeenCalledWith(amqpMsg, false, false);
        });
    });

    describe('MessageHandler — Detailed Scenarios', () => {
        let mockChannel: Partial<Channel>;
        let mockRepository: Partial<PostgresIncidentRepository>;
        let handler: MessageHandler;

        beforeEach(() => {
            mockChannel = {
                ack: vi.fn(),
                nack: vi.fn(),
            };
            mockRepository = {
                save: vi.fn().mockResolvedValue({}),
            };
            handler = new MessageHandler(mockChannel as Channel, mockRepository as any);
            vi.clearAllMocks();
        });

        it('should handle null message gracefully', async () => {
            await handler.handle(null);
            expect(mockChannel.ack!).not.toHaveBeenCalled();
            expect(mockChannel.nack!).not.toHaveBeenCalled();
        });

        it('should nack and send to DLQ on invalid JSON', async () => {
            const amqpMsg = {
                content: Buffer.from('invalid-json'),
                properties: { headers: {}, correlationId: '1' },
            } as unknown as ConsumeMessage;

            await handler.handle(amqpMsg);

            expect(mockChannel.nack!).toHaveBeenCalledWith(amqpMsg, false, true);
        });

        it('should nack and NOT requeue on missing type', async () => {
            const amqpMsg = {
                content: Buffer.from(JSON.stringify({ ticketId: '1' })),
                properties: { headers: {}, correlationId: '1' },
            } as unknown as ConsumeMessage;

            await handler.handle(amqpMsg);

            expect(mockChannel.nack!).toHaveBeenCalledWith(amqpMsg, false, false);
            expect(metrics.incrementRejected).toHaveBeenCalled();
        });

        it('should nack and NOT requeue on OTHER type without description', async () => {
            const amqpMsg = {
                content: Buffer.from(JSON.stringify({
                    ticketId: '1',
                    type: IncidentType.OTHER
                })),
                properties: { headers: {}, correlationId: '1' },
            } as unknown as ConsumeMessage;

            await handler.handle(amqpMsg);

            expect(mockChannel.nack!).toHaveBeenCalledWith(amqpMsg, false, false);
        });

        it('should requeue message on repository failure (retry)', async () => {
            const amqpMsg = {
                content: Buffer.from(JSON.stringify({
                    ticketId: '1',
                    type: IncidentType.NO_SERVICE,
                    lineNumber: '123',
                    createdAt: new Date()
                })),
                properties: { headers: {}, correlationId: '1' },
            } as unknown as ConsumeMessage;

            vi.mocked(mockRepository.save).mockRejectedValue(new Error('DB Fail'));

            await handler.handle(amqpMsg);

            expect(mockChannel.nack!).toHaveBeenCalledWith(amqpMsg, false, true);
            expect(metrics.incrementRetried).toHaveBeenCalled();
        });

        it('should send to DLQ after max retries', async () => {
            const amqpMsg = {
                content: Buffer.from(JSON.stringify({
                    ticketId: '1',
                    type: IncidentType.NO_SERVICE,
                    lineNumber: '123',
                    createdAt: new Date()
                })),
                properties: {
                    headers: { 'x-retry-count': 3 },
                    correlationId: '1'
                },
            } as unknown as ConsumeMessage;

            vi.mocked(mockRepository.save).mockRejectedValue(new Error('DB Fail'));

            await handler.handle(amqpMsg);

            expect(mockChannel.nack!).toHaveBeenCalledWith(amqpMsg, false, false);
            expect(metrics.incrementRejected).toHaveBeenCalled();
        });

        it('should handle x-death header for retries', async () => {
            const amqpMsg = {
                content: Buffer.from(JSON.stringify({
                    ticketId: '1',
                    type: IncidentType.NO_SERVICE,
                    lineNumber: '123',
                    createdAt: new Date()
                })),
                properties: {
                    headers: { 'x-death': [{ count: 3 }] },
                    correlationId: '1'
                },
            } as unknown as ConsumeMessage;

            vi.mocked(mockRepository.save).mockRejectedValue(new Error('DB Fail'));

            await handler.handle(amqpMsg);

            expect(mockChannel.nack!).toHaveBeenCalledWith(amqpMsg, false, false);
        });
    });
});
